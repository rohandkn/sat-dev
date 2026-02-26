import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamChatCompletion } from '@/lib/openai/streaming'
import { buildRemediationStartPrompt } from '@/lib/openai/prompts/remediation'
import { z } from 'zod'

const requestSchema = z.object({
  questionId: z.string().uuid(),
  sessionId: z.string().uuid(),
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

    const { questionId, sessionId } = parsed.data

    // Fetch the question
    const { data: question } = await supabase
      .from('exam_questions')
      .select('*, learning_sessions!inner(topic_id, topics!inner(name))')
      .eq('id', questionId)
      .eq('user_id', user.id)
      .single()

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    if (question.exam_type === 'remediation') {
      const { data: latestAttemptRow } = await supabase
        .from('exam_questions')
        .select('attempt_number')
        .eq('session_id', sessionId)
        .eq('exam_type', 'remediation')
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const latestAttempt = latestAttemptRow?.attempt_number ?? null
      if (latestAttempt && question.attempt_number !== latestAttempt) {
        return NextResponse.json({ error: 'Stale remediation question' }, { status: 400 })
      }
    }

    // Always start a fresh thread for this question to avoid leaking prior
    // remediation history across attempts.
    const { data: existingThread } = await supabase
      .from('remediation_threads')
      .select('id')
      .eq('question_id', questionId)
      .eq('user_id', user.id)
      .single()

    if (existingThread) {
      await supabase
        .from('remediation_messages')
        .delete()
        .eq('thread_id', existingThread.id)

      await supabase
        .from('remediation_threads')
        .delete()
        .eq('id', existingThread.id)
    }

    // Fetch student model
    const { data: studentModel } = await supabase
      .from('student_models')
      .select('*')
      .eq('user_id', user.id)
      .eq('topic_id', (question.learning_sessions as { topic_id: string }).topic_id)
      .single()

    const topicName = ((question.learning_sessions as { topics: { name: string } }).topics).name

    // Create thread
    const { data: thread } = await supabase
      .from('remediation_threads')
      .insert({
        question_id: questionId,
        user_id: user.id,
        session_id: sessionId,
      })
      .select()
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Failed to create thread' }, { status: 500 })
    }

    // Generate initial remediation message
    const prompt = buildRemediationStartPrompt({
      topicName,
      questionText: question.question_text,
      choices: question.choices as Record<string, string>,
      correctAnswer: question.correct_answer,
      userAnswer: question.user_answer,
      isIdk: question.is_idk,
      explanation: question.explanation,
      studentModel: studentModel ?? undefined,
    })

    const stream = await streamChatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, maxTokens: 1024 }
    )

    // Collect the full message while streaming
    let fullMessage = ''
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk)
        fullMessage += text
        controller.enqueue(chunk)
      },
      async flush() {
        // Save the message
        await supabase.from('remediation_messages').insert({
          thread_id: thread.id,
          role: 'assistant',
          content: fullMessage,
        })
      }
    })

    const readableStream = stream.pipeThrough(transformStream)

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Thread-Id': thread.id,
      },
    })
  } catch (error) {
    console.error('Remediation start error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
