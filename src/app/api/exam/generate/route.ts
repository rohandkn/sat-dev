import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonChatCompletion } from '@/lib/openai/streaming'
import {
  examGenerationJsonSchema,
  examValidationJsonSchema,
  type ExamGeneration,
  type ExamValidation,
} from '@/lib/openai/schemas'
import { buildExamPrompt, buildExamValidationPrompt } from '@/lib/openai/prompts/exam'
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

const MAX_GENERATION_ATTEMPTS = 5
const MAX_VALIDATION_ATTEMPTS = 2
const MAX_PARTIAL_REGEN_ATTEMPTS = 3

function normalizeChoiceValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function hasDuplicateChoiceValues(choices: Record<string, string>): boolean {
  const normalized = Object.values(choices).map(value => value.trim().replace(/\s+/g, ' '))
  return new Set(normalized).size !== normalized.length
}

function getDuplicateChoiceValues(choices: Record<string, string>): string[] {
  const normalized = Object.values(choices).map(normalizeChoiceValue)
  const counts = new Map<string, number>()
  for (const value of normalized) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
}

function isGraphingNotEqualsQuestion(text: string): boolean {
  const normalized = text.toLowerCase()
  const hasNotEquals = /\\neq|not\s+equal|is\s+not\s+equal|≠/i.test(text)
  const mentionsGraph = /graph|graphing|represents\s+the\s+solution/i.test(normalized)
  const hasOtherInequalities = /<|>|\\leq|\\geq|\\lt|\\gt|≤|≥/i.test(text)
  const isSingleNotEquals = /(?:^|[^a-zA-Z])\s*(x|y)\s*\\neq\s*[-+]?\d/.test(text)
  return hasNotEquals && mentionsGraph && !hasOtherInequalities && isSingleNotEquals
}

function hasBothSidesShading(choices: Record<string, string>): boolean {
  const normalized = Object.values(choices).map(choice => choice.toLowerCase())
  return normalized.some(choice => (
    /both\s+sides/.test(choice)
    || /shaded\s+on\s+both\s+sides/.test(choice)
    || /shading\s+on\s+both\s+sides/.test(choice)
    || /shade\s+on\s+both\s+sides/.test(choice)
    || /both\s+regions/.test(choice)
  ))
}

function parseNotEqualsExcludedValue(questionText: string): number | null {
  if (!/not a possible value/i.test(questionText)) return null
  const normalized = questionText.replace(/\$/g, '').replace(/\s+/g, ' ')
  const match = normalized.match(/([+-]?\d*)x\s*([+-]\s*\d+)?\s*\\neq\s*([+-]?\d+)/i)
  if (!match) return null

  const rawA = match[1]
  const rawB = match[2]
  const rawC = match[3]

  const a = rawA === '' || rawA === '+' ? 1 : rawA === '-' ? -1 : Number(rawA)
  const b = rawB ? Number(rawB.replace(/\s+/g, '')) : 0
  const c = Number(rawC)

  if (!Number.isFinite(a) || a === 0 || !Number.isFinite(b) || !Number.isFinite(c)) return null
  return (c - b) / a
}

function findChoiceForValue(choices: Record<string, string>, value: number): string | null {
  for (const [key, raw] of Object.entries(choices)) {
    const normalized = raw.replace(/\$/g, '').replace(/\s+/g, '')
    if (normalized === String(value)) return key
    if (Number(normalized) === value) return key
  }
  return null
}

async function validateQuestions(
  questions: ExamGeneration['questions']
): Promise<{
  validationByIndex: Map<number, string[]>
  missingValidation: boolean
  duplicateIndexes: number[]
  incorrectIndexes: number[]
  graphingNotEqualsIndexes: number[]
}> {
  let validation: ExamValidation | null = null

  for (let vAttempt = 1; vAttempt <= MAX_VALIDATION_ATTEMPTS; vAttempt += 1) {
    const validationPrompt = buildExamValidationPrompt(
      questions.map(q => ({
        question_text: q.question_text,
        choices: q.choices,
      }))
    )

    const validationResult = await jsonChatCompletion<ExamValidation>(
      [
        {
          role: 'system',
          content: 'You are a careful SAT Math validator. Do not assume the provided answer is correct.',
        },
        { role: 'user', content: validationPrompt },
      ],
      examValidationJsonSchema,
      'exam_validation',
      0
    )

    const hasAllResults = validationResult.results.length === questions.length
      && validationResult.results.every((item, i) => item.index === i + 1)

    if (hasAllResults) {
      validation = validationResult
      break
    }
  }

  const validationByIndex = new Map<number, string[]>()
  if (validation) {
    for (const item of validation.results) {
      validationByIndex.set(item.index, item.correct_choices)
    }
  }

  const missingValidation = !validation
    || questions.some((_, i) => !validationByIndex.has(i + 1))

  const duplicateIndexes = questions
    .map((q, i) => (hasDuplicateChoiceValues(q.choices) ? i + 1 : null))
    .filter((index): index is number => index !== null)

  const incorrectIndexes = questions
    .map((q, i) => {
      const index = i + 1
      const correctChoices = validationByIndex.get(index)
      if (!correctChoices) return index
      if (correctChoices.length !== 1) return index
      if (correctChoices[0] !== q.correct_answer) {
        const excludedValue = parseNotEqualsExcludedValue(q.question_text)
        if (excludedValue !== null) {
          const excludedChoice = findChoiceForValue(q.choices, excludedValue)
          if (excludedChoice && excludedChoice === q.correct_answer) {
            return null
          }
        }
        return index
      }
      return null
    })
    .filter((index): index is number => index !== null)

  const graphingNotEqualsIndexes = questions
    .map((q, i) => {
      const index = i + 1
      if (!isGraphingNotEqualsQuestion(q.question_text)) return null
      if (hasBothSidesShading(q.choices)) return null
      return index
    })
    .filter((index): index is number => index !== null)

  return {
    validationByIndex,
    missingValidation,
    duplicateIndexes,
    incorrectIndexes,
    graphingNotEqualsIndexes,
  }
}

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
    const attemptNumber = examType === 'remediation'
      ? Math.max(1, session.remediation_loop_count ?? 1)
      : 1
    const questionCount = examType === 'pre'
      ? PRE_EXAM_QUESTION_COUNT
      : examType === 'post'
        ? POST_EXAM_QUESTION_COUNT
        : REMEDIATION_EXAM_QUESTION_COUNT

    // If already active, return existing questions (handles page reload)
    if (session.state === activeState) {
      const { data: existingQuestions } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('exam_type', examType)
        .eq('attempt_number', attemptNumber)
        .is('user_answer', null)
        .order('question_number')

      if (existingQuestions && existingQuestions.length > 0) {
        if (existingQuestions.length === questionCount) {
          return NextResponse.json({ questions: existingQuestions })
        }
        await supabase
          .from('exam_questions')
          .delete()
          .eq('session_id', sessionId)
          .eq('exam_type', examType)
          .eq('attempt_number', attemptNumber)
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

    if (examType === 'remediation' && session.state !== activeState) {
      const { data: existingRemediation } = await supabase
        .from('exam_questions')
        .select('id, user_answer, is_correct, is_idk')
        .eq('session_id', sessionId)
        .eq('exam_type', examType)
        .eq('attempt_number', attemptNumber)

      const hasUnanswered = (existingRemediation ?? []).some(q => q.user_answer === null)
      const hasAnswered = (existingRemediation ?? []).some(q => q.user_answer !== null || q.is_correct !== null || q.is_idk)

      if (hasAnswered && !hasUnanswered) {
        await supabase
          .from('exam_questions')
          .delete()
          .eq('session_id', sessionId)
          .eq('exam_type', examType)
          .eq('attempt_number', attemptNumber)
      }
    }

    // Belt-and-suspenders: if questions were already inserted by a concurrent
    // request that raced past the state guard, return them instead of generating
    // a second set (which would create duplicates).
    const { data: raceCheck } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('exam_type', examType)
      .eq('attempt_number', attemptNumber)
      .is('user_answer', null)
      .order('question_number')

    if (raceCheck && raceCheck.length > 0) {
      if (raceCheck.length === questionCount) {
        await supabase
          .from('learning_sessions')
          .update({ state: activeState, updated_at: new Date().toISOString() })
          .eq('id', sessionId)
        return NextResponse.json({ questions: raceCheck })
      }
      await supabase
        .from('exam_questions')
        .delete()
        .eq('session_id', sessionId)
        .eq('exam_type', examType)
        .eq('attempt_number', attemptNumber)
    }

    let avoidQuestions: string[] = []
    if (examType === 'remediation' && attemptNumber > 1) {
      const { data: priorRemediation } = await supabase
        .from('exam_questions')
        .select('question_text')
        .eq('session_id', sessionId)
        .eq('exam_type', 'remediation')
        .lt('attempt_number', attemptNumber)

      avoidQuestions = (priorRemediation ?? []).map(q => q.question_text)
    }

    // Generate questions via GPT-4o
    const prompt = buildExamPrompt({
      topicName: topic.name,
      topicDescription: topic.description ?? '',
      examType,
      questionCount,
      studentModel: studentModel ?? undefined,
      priorWrongQuestions: priorWrongQuestions.length > 0 ? priorWrongQuestions : undefined,
      avoidQuestions: avoidQuestions.length > 0 ? avoidQuestions : undefined,
    })

    let result: ExamGeneration | null = null
    let lastValidationError: string | null = null

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const attemptPrompt = lastValidationError
        ? `${prompt}\n\nVALIDATION FEEDBACK (fix these issues):\n- ${lastValidationError}\n- Ensure each question has exactly one correct choice and three incorrect distractors. Avoid ambiguous wording.`
        : prompt

      const generated = await jsonChatCompletion<ExamGeneration>(
        [
          {
            role: 'system',
            content: 'You are a precise SAT Math question writer. Every answer and explanation must be mathematically correct. Solve each problem fully before writing. Never second-guess or recompute within an explanation.',
          },
          { role: 'user', content: attemptPrompt },
        ],
        examGenerationJsonSchema,
        'exam_generation',
        0.3
      )

      const {
        validationByIndex,
        missingValidation,
        duplicateIndexes,
        incorrectIndexes,
        graphingNotEqualsIndexes,
      } = await validateQuestions(generated.questions)

      if (!missingValidation
        && duplicateIndexes.length === 0
        && incorrectIndexes.length === 0
        && graphingNotEqualsIndexes.length === 0) {
        result = generated
        break
      }

      if (missingValidation
        || duplicateIndexes.length > 0
        || incorrectIndexes.length > 0
        || graphingNotEqualsIndexes.length > 0) {
        console.error('Exam generation validation details:', {
          attempt,
          missingValidation,
          duplicateChoiceIndexes: duplicateIndexes,
          incorrectIndexes,
          graphingNotEqualsIndexes,
        })

        if (duplicateIndexes.length > 0) {
          const duplicateDetails = duplicateIndexes.map(index => {
            const q = generated.questions[index - 1]
            return {
              index,
              question_text: q?.question_text,
              choices: q?.choices,
              duplicate_values: q ? getDuplicateChoiceValues(q.choices) : [],
            }
          })
          console.error('Duplicate choice details:', duplicateDetails)
        }

        if (incorrectIndexes.length > 0) {
          const mismatchDetails = incorrectIndexes.map(index => {
            const q = generated.questions[index - 1]
            return {
              index,
              question_text: q?.question_text,
              choices: q?.choices,
              model_correct_answer: q?.correct_answer,
              validator_correct_choices: validationByIndex.get(index) ?? null,
            }
          })
          console.error('Validator mismatch details:', mismatchDetails)
        }

        if (graphingNotEqualsIndexes.length > 0) {
          const graphingDetails = graphingNotEqualsIndexes.map(index => {
            const q = generated.questions[index - 1]
            return {
              index,
              question_text: q?.question_text,
              choices: q?.choices,
            }
          })
          console.error('Graphing not-equals details:', graphingDetails)
        }
      }

      lastValidationError = [
        missingValidation ? 'Validator did not return results for every question.' : null,
        duplicateIndexes.length > 0
          ? `Duplicate choice values in questions: ${duplicateIndexes.join(', ')}`
          : null,
        incorrectIndexes.length > 0
          ? `Invalid or non-unique correct answers in questions: ${incorrectIndexes.join(', ')}`
          : null,
        graphingNotEqualsIndexes.length > 0
          ? `Graphing not-equals questions missing both-sides shading: ${graphingNotEqualsIndexes.join(', ')}`
          : null,
      ].filter(Boolean).join(' | ')

      // Attempt partial regeneration for invalid questions instead of discarding all.
      if (!missingValidation) {
        const invalidIndexes = Array.from(new Set([
          ...duplicateIndexes,
          ...incorrectIndexes,
          ...graphingNotEqualsIndexes,
        ]))
        if (invalidIndexes.length > 0) {
          console.error('Attempting partial regeneration for questions:', invalidIndexes)
        }

        for (const index of invalidIndexes) {
          let replaced = false
          for (let regenAttempt = 1; regenAttempt <= MAX_PARTIAL_REGEN_ATTEMPTS; regenAttempt += 1) {
            const singlePrompt = buildExamPrompt({
              topicName: topic.name,
              topicDescription: topic.description ?? '',
              examType,
              questionCount: 1,
              studentModel: studentModel ?? undefined,
              priorWrongQuestions: priorWrongQuestions.length > 0 ? priorWrongQuestions : undefined,
              avoidQuestions: avoidQuestions.length > 0 ? avoidQuestions : undefined,
            })

            const regen = await jsonChatCompletion<ExamGeneration>(
              [
                {
                  role: 'system',
                  content: 'You are a precise SAT Math question writer. Every answer and explanation must be mathematically correct. Solve each problem fully before writing. Never second-guess or recompute within an explanation.',
                },
                {
                  role: 'user',
                  content: `${singlePrompt}\n\nREGENERATION INSTRUCTIONS:\n- This replaces question #${index}.\n- Ensure exactly one correct answer.\n- Avoid ambiguous wording.\n- Ensure choices are distinct values.`,
                },
              ],
              examGenerationJsonSchema,
              'exam_generation',
              0.3
            )

            const candidate = regen.questions[0]
            if (!candidate) continue

            const {
              missingValidation: candidateMissing,
              duplicateIndexes: candidateDuplicates,
              incorrectIndexes: candidateIncorrect,
              graphingNotEqualsIndexes: candidateGraphingNotEquals,
            } = await validateQuestions([candidate])

            if (!candidateMissing
              && candidateDuplicates.length === 0
              && candidateIncorrect.length === 0
              && candidateGraphingNotEquals.length === 0) {
              generated.questions[index - 1] = candidate
              replaced = true
              break
            }
          }

          if (!replaced) {
            console.error('Partial regeneration failed for question index:', index)
          }
        }

        const postPartial = await validateQuestions(generated.questions)
        if (!postPartial.missingValidation
          && postPartial.duplicateIndexes.length === 0
          && postPartial.incorrectIndexes.length === 0
          && postPartial.graphingNotEqualsIndexes.length === 0) {
          result = generated
          break
        }
      }
    }

    if (!result) {
      console.error('Exam generation validation failed:', lastValidationError)
      return NextResponse.json({ error: 'Failed to generate valid questions' }, { status: 500 })
    }

    // Save questions to DB
    const questionsToInsert = result.questions.map((q, i) => ({
      session_id: sessionId,
      user_id: user.id,
      exam_type: examType,
      attempt_number: attemptNumber,
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
