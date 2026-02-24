import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonChatCompletion } from '@/lib/openai/streaming'
import { examGenerationJsonSchema, type ExamGeneration } from '@/lib/openai/schemas'
import { buildExamPrompt } from '@/lib/openai/prompts/exam'
import {
  PRE_EXAM_QUESTION_COUNT,
  POST_EXAM_QUESTION_COUNT,
  REMEDIATION_EXAM_QUESTION_COUNT,
} from '@/lib/learning-loop/scoring'
import { canTransition } from '@/lib/learning-loop/state-machine'
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
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
    }

    const { sessionId, examType } = parsed.data

    // Fetch session
    const { data: session } = await supabase
      .from('learning_sessions')
      .select('*, topics(*)')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const prefix = examType === 'pre' ? 'pre' : examType === 'post' ? 'post' : 'remediation'
    const pendingState = `${prefix}_exam_pending`
    const activeState = `${prefix}_exam_active`

    // If already active, return existing questions (handles page reload)
    if (session.state === activeState) {
      const { data: existingQuestions } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('exam_type', examType)
        .is('user_answer', null)
        .order('question_number')

      if (existingQuestions && existingQuestions.length > 0) {
        return NextResponse.json({ questions: existingQuestions })
      }
      // If no unanswered questions exist, fall through to generate new ones
    }

    // Accept pending state, or any state that can transition to active
    if (session.state !== pendingState && !canTransition(session.state, activeState)) {
      return NextResponse.json({
        error: `Cannot start ${examType} exam from state ${session.state}`,
      }, { status: 400 })
    }

    const topic = session.topics as { name: string; description: string | null }

    // Fetch student model
    const { data: studentModel } = await supabase
      .from('student_models')
      .select('*')
      .eq('user_id', user.id)
      .eq('topic_id', session.topic_id)
      .single()

    // For post/remediation exams, get prior wrong questions
    let priorWrongQuestions: Array<{
      question_text: string
      correct_answer: string
      user_answer: string | null
    }> = []

    if (examType !== 'pre') {
      const priorExamType = examType === 'post' ? 'pre' : 'post'
      const { data: priorQuestions } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('exam_type', priorExamType)
        .or('is_correct.eq.false,is_idk.eq.true')

      priorWrongQuestions = (priorQuestions ?? []).map(q => ({
        question_text: q.question_text,
        correct_answer: q.correct_answer,
        user_answer: q.user_answer,
      }))
    }

    // Belt-and-suspenders: if questions were already inserted by a concurrent
    // request that raced past the state guard, return them instead of generating
    // a second set (which would create duplicates).
    const { data: raceCheck } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exam_type', examType)
      .order('question_number')

    if (raceCheck && raceCheck.length > 0) {
      await supabase
        .from('learning_sessions')
        .update({ state: activeState, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      return NextResponse.json({ questions: raceCheck })
    }

    const questionCount = examType === 'pre'
      ? PRE_EXAM_QUESTION_COUNT
      : examType === 'post'
        ? POST_EXAM_QUESTION_COUNT
        : REMEDIATION_EXAM_QUESTION_COUNT

    // Generate questions via GPT-4o
    const prompt = buildExamPrompt({
      topicName: topic.name,
      topicDescription: topic.description ?? '',
      examType,
      questionCount,
      studentModel: studentModel ?? undefined,
      priorWrongQuestions: priorWrongQuestions.length > 0 ? priorWrongQuestions : undefined,
    })

    const result = await jsonChatCompletion<ExamGeneration>(
      [
        {
          role: 'system',
          content: 'You are a precise SAT Math question writer. Every answer and explanation must be mathematically correct. Solve each problem fully before writing. Never second-guess or recompute within an explanation.',
        },
        { role: 'user', content: prompt },
      ],
      examGenerationJsonSchema,
      'exam_generation',
      0.3
    )

    // Save questions to DB
    const questionsToInsert = result.questions.map((q, i) => ({
      session_id: sessionId,
      user_id: user.id,
      exam_type: examType,
      question_number: i + 1,
      question_text: q.question_text,
      choices: q.choices,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
    }))

    const { data: savedQuestions, error: insertError } = await supabase
      .from('exam_questions')
      .insert(questionsToInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 })
    }

    // Update session state
    await supabase
      .from('learning_sessions')
      .update({ state: activeState, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return NextResponse.json({ questions: savedQuestions })
  } catch (error) {
    console.error('Exam generation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
