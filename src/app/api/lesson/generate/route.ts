import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamChatCompletion } from '@/lib/openai/streaming'
import { buildLessonPrompt } from '@/lib/openai/prompts/lesson'
import { canTransition } from '@/lib/learning-loop/state-machine'
import { z } from 'zod'

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  lessonType: z.enum(['initial', 'remediation']).default('initial'),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 })
    }

    const { sessionId, lessonType } = parsed.data

    // Fetch session with topic
    const { data: session } = await supabase
      .from('learning_sessions')
      .select('*, topics(*)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 })
    }

    // Validate state transition
    const pendingState = lessonType === 'initial' ? 'lesson_pending' : 'remediation_lesson_pending'
    const activeState = lessonType === 'initial' ? 'lesson_active' : 'remediation_lesson_active'

    if (!canTransition(session.state, activeState) && session.state !== pendingState) {
      // Allow generating from completed pre-exam state
      if (!(session.state === 'pre_exam_completed' && lessonType === 'initial')) {
        return new Response(JSON.stringify({
          error: `Cannot generate ${lessonType} lesson from state ${session.state}`,
        }), { status: 400 })
      }
    }

    const topic = session.topics as { name: string; description: string | null }

    // Fetch student model
    const { data: studentModel } = await supabase
      .from('student_models')
      .select('*')
      .eq('user_id', user.id)
      .eq('topic_id', session.topic_id)
      .single()

    // Fetch wrong questions from the relevant exam
    const examType = lessonType === 'initial' ? 'pre' : 'post'
    const { data: wrongQuestions } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exam_type', examType)
      .or('is_correct.eq.false,is_idk.eq.true')

    // For remediation lessons, also gather remediation thread insights
    let remediationInsights = ''
    if (lessonType === 'remediation') {
      const { data: threads } = await supabase
        .from('remediation_threads')
        .select('*, remediation_messages(*)')
        .eq('session_id', sessionId)

      if (threads && threads.length > 0) {
        remediationInsights = threads.map(t => {
          const msgs = (t.remediation_messages as Array<{ role: string; content: string }>)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n')
          return `Thread (resolved: ${t.is_resolved}):\n${msgs}`
        }).join('\n\n')
      }
    }

    // Build prompt
    const prompt = buildLessonPrompt({
      topicName: topic.name,
      topicDescription: topic.description ?? '',
      lessonType,
      sessionNumber: session.session_number,
      studentModel: studentModel ?? undefined,
      wrongQuestions: (wrongQuestions ?? []).map(q => ({
        question_text: q.question_text,
        choices: q.choices as Record<string, string>,
        correct_answer: q.correct_answer,
        user_answer: q.user_answer,
        is_idk: q.is_idk,
        explanation: q.explanation,
      })),
      remediationInsights: remediationInsights || undefined,
    })

    // Update session state
    await supabase
      .from('learning_sessions')
      .update({ state: activeState, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    // Create lesson record
    const { data: lesson } = await supabase
      .from('lessons')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        lesson_type: lessonType,
        content: '',
      })
      .select()
      .single()

    // Stream the lesson
    const stream = await streamChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, maxTokens: 4096 }
    )

    // Create a transform stream that also saves content
    let fullContent = ''
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        fullContent += text
        controller.enqueue(chunk)
      },
      async flush() {
        // Save the complete lesson content
        if (lesson) {
          await supabase
            .from('lessons')
            .update({ content: fullContent })
            .eq('id', lesson.id)
        }

        // Update session state to completed
        const completedState = lessonType === 'initial' ? 'lesson_completed' : 'remediation_lesson_completed'
        await supabase
          .from('learning_sessions')
          .update({ state: completedState, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }
    })

    const readableStream = stream.pipeThrough(transformStream)

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Lesson generation error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
}
