import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonChatCompletion } from '@/lib/openai/streaming'
import { buildRemediationRespondPrompt } from '@/lib/openai/prompts/remediation'
import { remediationResponseJsonSchema, type RemediationResponse } from '@/lib/openai/schemas'
import { z } from 'zod'

const requestSchema = z.object({
  threadId: z.string().uuid(),
  message: z.string().min(1).max(2000),
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

    const { threadId, message } = parsed.data

    // Fetch thread with question
    const { data: thread } = await supabase
      .from('remediation_threads')
      .select('*, exam_questions!inner(*, learning_sessions!inner(topic_id, topics!inner(name)))')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }

    if (thread.is_resolved) {
      return NextResponse.json({ error: 'Thread already resolved' }, { status: 400 })
    }

    // Save user message
    await supabase.from('remediation_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: message,
    })

    // Fetch conversation history
    const { data: messages } = await supabase
      .from('remediation_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at')

    const question = thread.exam_questions as {
      question_text: string
      choices: Record<string, string>
      correct_answer: string
      explanation: string
      learning_sessions: { topics: { name: string } }
    }

    const conversationHistory = (messages ?? []).map(m => ({
      role: m.role as 'assistant' | 'user',
      content: m.content,
    }))

    // Generate response
    const prompt = buildRemediationRespondPrompt({
      topicName: question.learning_sessions.topics.name,
      questionText: question.question_text,
      choices: question.choices,
      correctAnswer: question.correct_answer,
      explanation: question.explanation,
      conversationHistory,
      studentMessage: message,
    })

    const response = await jsonChatCompletion<RemediationResponse>(
      [{ role: 'user', content: prompt }],
      remediationResponseJsonSchema,
      'remediation_response'
    )

    // Save assistant message
    await supabase.from('remediation_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: response.message,
    })

    // Update thread resolution
    if (response.is_resolved) {
      await supabase
        .from('remediation_threads')
        .update({ is_resolved: true, updated_at: new Date().toISOString() })
        .eq('id', threadId)
    }

    return NextResponse.json({
      message: response.message,
      isResolved: response.is_resolved,
    })
  } catch (error) {
    console.error('Remediation respond error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
