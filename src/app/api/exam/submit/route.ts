import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateScore, gradeAnswer } from '@/lib/learning-loop/scoring'
import { canTransition, getNextState } from '@/lib/learning-loop/state-machine'
import { unlockNextTopic } from '@/lib/learning-loop/progression'
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

const SCORE_FIELDS = {
  pre: 'pre_exam_score',
  post: 'post_exam_score',
  remediation: 'remediation_exam_score',
} as const

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

    // Guard: examType maps directly to its state prefix (e.g. 'post' → 'post_exam_active')
    const expectedState = `${examType}_exam_active`
    if (session.state !== expectedState) {
      return NextResponse.json({ error: `Session not in ${expectedState} state` }, { status: 400 })
    }

    // Fetch all questions in one round-trip
    const questionIds = answers.map(a => a.questionId)
    const { data: questions, error: questionsError } = await supabase
      .from('exam_questions')
      .select('*')
      .in('id', questionIds)
      .eq('user_id', user.id)

    if (questionsError || !questions) {
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
    }

    const questionMap = new Map(questions.map(q => [q.id, q]))

    // Grade all answers in memory
    const results = answers.flatMap(answer => {
      const question = questionMap.get(answer.questionId)
      if (!question) return []
      const isCorrect = gradeAnswer({
        answer: answer.answer,
        isIdk: answer.isIdk,
        correctAnswer: question.correct_answer,
      })
      return [{
        questionId: answer.questionId,
        isCorrect,
        isIdk: answer.isIdk,
        userAnswer: answer.answer,
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
      }]
    })

    // Write all graded answers in one upsert
    const questionUpdates = results.map(r => {
      const original = questionMap.get(r.questionId)!
      return {
        ...original,
        user_answer: r.userAnswer,
        is_correct: r.isCorrect,
        is_idk: r.isIdk,
      }
    })

    const { error: upsertError } = await supabase
      .from('exam_questions')
      .upsert(questionUpdates, { onConflict: 'id' })

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to save answers' }, { status: 500 })
    }

    const score = calculateScore(results.map(r => ({ is_correct: r.isCorrect })))
    const hasWrongAnswers = results.some(r => !r.isCorrect || r.isIdk)

    // Determine next state
    const completedState = `${examType}_exam_completed`
    if (!canTransition(session.state, completedState)) {
      return NextResponse.json({ error: 'Invalid state transition' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      state: completedState,
      [SCORE_FIELDS[examType]]: score,
      updated_at: new Date().toISOString(),
    }

    let nextState = completedState
    if (examType === 'post' || examType === 'remediation') {
      nextState = getNextState(completedState, {
        examScore: score,
        remediationLoopCount: session.remediation_loop_count,
      })

      if (nextState) {
        updates.state = nextState
        if (nextState === 'remediation_active') {
          updates.remediation_loop_count = session.remediation_loop_count + 1
        }
      }
    }

    // Perfect score on pre-exam means the student already knows the material.
    // Skip the lesson/post-exam cycle and advance directly to session_passed.
    if (examType === 'pre' && score === 100) {
      updates.state = 'session_passed'
      nextState = 'session_passed'
    }

    await supabase
      .from('learning_sessions')
      .update(updates)
      .eq('id', sessionId)

    // When session is passed, unlock the next topic and mark current as completed
    if (nextState === 'session_passed') {
      await Promise.all([
        unlockNextTopic(supabase, user.id, session.topic_id),
        supabase
          .from('user_topic_progress')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('topic_id', session.topic_id),
      ])
    }

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
