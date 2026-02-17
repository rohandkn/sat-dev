import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonChatCompletion } from '@/lib/openai/streaming'
import { studentModelUpdateJsonSchema, type StudentModelUpdate } from '@/lib/openai/schemas'
import { buildStudentModelUpdatePrompt } from '@/lib/openai/prompts/student-model'
import { z } from 'zod'

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  examType: z.enum(['pre', 'post', 'remediation']),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { sessionId, examType } = parsed.data

    // Fetch session with topic
    const { data: session } = await supabase
      .from('learning_sessions')
      .select('*, topics(name)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const topicName = (session.topics as { name: string }).name

    // Fetch current student model
    const { data: currentModel } = await supabase
      .from('student_models')
      .select('*')
      .eq('user_id', user.id)
      .eq('topic_id', session.topic_id)
      .single()

    const model = currentModel ?? {
      strengths: [],
      weaknesses: [],
      misconceptions: [],
      mastery_level: 0,
    }

    // Fetch exam results
    const { data: examQuestions } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exam_type', examType)

    if (!examQuestions || examQuestions.length === 0) {
      return NextResponse.json({ error: 'No exam results found' }, { status: 400 })
    }

    // Gather remediation insights
    let remediationInsights = ''
    const { data: threads } = await supabase
      .from('remediation_threads')
      .select('*, remediation_messages(*)')
      .eq('session_id', sessionId)

    if (threads && threads.length > 0) {
      remediationInsights = threads.map(t => {
        const msgs = (t.remediation_messages as Array<{ role: string; content: string }>)
          .slice(-4) // Last 4 messages for context
          .map(m => `${m.role}: ${m.content}`)
          .join('\n')
        return `Resolved: ${t.is_resolved}\n${msgs}`
      }).join('\n---\n')
    }

    // Build prompt and get LLM update
    const prompt = buildStudentModelUpdatePrompt({
      topicName,
      currentModel: model,
      examResults: examQuestions.map(q => ({
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        user_answer: q.user_answer,
        is_correct: q.is_correct,
        is_idk: q.is_idk,
      })),
      remediationInsights: remediationInsights || undefined,
    })

    const update = await jsonChatCompletion<StudentModelUpdate>(
      [{ role: 'user', content: prompt }],
      studentModelUpdateJsonSchema,
      'student_model_update'
    )

    // Upsert student model
    if (currentModel) {
      await supabase
        .from('student_models')
        .update({
          strengths: update.strengths,
          weaknesses: update.weaknesses,
          misconceptions: update.misconceptions,
          mastery_level: update.mastery_level,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentModel.id)
    } else {
      await supabase
        .from('student_models')
        .insert({
          user_id: user.id,
          topic_id: session.topic_id,
          strengths: update.strengths,
          weaknesses: update.weaknesses,
          misconceptions: update.misconceptions,
          mastery_level: update.mastery_level,
        })
    }

    return NextResponse.json({ update })
  } catch (error) {
    console.error('Student model update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
