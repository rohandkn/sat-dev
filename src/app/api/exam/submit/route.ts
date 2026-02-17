import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateScore } from '@/lib/learning-loop/scoring'
import { canTransition, getNextState } from '@/lib/learning-loop/state-machine'
import { z } from 'zod'

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().nullable(),
  isIdk: z.boolean().default(false),
})

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  examType: z.enum(['pre', 'post', 'remediation']),
  answers: z.array(answerSchema),
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

    const { sessionId, examType, answers } = parsed.data

    // Fetch session
    const { data: session } = await supabase
      .from('learning_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Validate state
    const expectedState = `${examType === 'pre' ? 'pre' : examType === 'post' ? 'post' : 'remediation'}_exam_active`
    if (session.state !== expectedState) {
      return NextResponse.json({ error: `Session not in ${expectedState} state` }, { status: 400 })
    }

    // Grade answers
    const results = []
    for (const answer of answers) {
      const { data: question } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('id', answer.questionId)
        .eq('user_id', user.id)
        .single()

      if (!question) continue

      const isCorrect = !answer.isIdk && answer.answer === question.correct_answer

      await supabase
        .from('exam_questions')
        .update({
          user_answer: answer.answer,
          is_correct: isCorrect,
          is_idk: answer.isIdk,
        })
        .eq('id', answer.questionId)

      results.push({
        questionId: answer.questionId,
        isCorrect,
        isIdk: answer.isIdk,
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
      })
    }

    const score = calculateScore(results.map(r => ({ is_correct: r.isCorrect })))
    const hasWrongAnswers = results.some(r => !r.isCorrect || r.isIdk)

    // Update session state and score
    const completedState = `${examType === 'pre' ? 'pre' : examType === 'post' ? 'post' : 'remediation'}_exam_completed`
    if (!canTransition(session.state, completedState)) {
      return NextResponse.json({ error: 'Invalid state transition' }, { status: 400 })
    }

    const scoreField = examType === 'pre' ? 'pre_exam_score'
      : examType === 'post' ? 'post_exam_score'
        : 'remediation_exam_score'

    const updates: Record<string, unknown> = {
      state: completedState,
      [scoreField]: score,
      updated_at: new Date().toISOString(),
    }

    // For post/remediation exams, determine next state
    let nextState = completedState
    if (examType === 'post' || examType === 'remediation') {
      nextState = getNextState(completedState, {
        examScore: score,
        hasWrongAnswers,
        remediationLoopCount: session.remediation_loop_count,
      })

      if (nextState) {
        updates.state = nextState
        if (nextState === 'remediation_active') {
          updates.remediation_loop_count = session.remediation_loop_count + 1
        }
      }
    }

    await supabase
      .from('learning_sessions')
      .update(updates)
      .eq('id', sessionId)

    return NextResponse.json({
      score,
      results,
      nextState: nextState || completedState,
      hasWrongAnswers,
    })
  } catch (error) {
    console.error('Exam submit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
