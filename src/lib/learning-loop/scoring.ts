export const PASS_THRESHOLD = 80 // percentage
export const MAX_REMEDIATION_LOOPS = 3
export const PRE_EXAM_QUESTION_COUNT = 5
export const POST_EXAM_QUESTION_COUNT = 5
export const REMEDIATION_EXAM_QUESTION_COUNT = 3

export function calculateScore(
  questions: Array<{ is_correct: boolean | null }>
): number {
  if (questions.length === 0) return 0
  const correct = questions.filter(q => q.is_correct === true).length
  return Math.round((correct / questions.length) * 100)
}

export function isPassing(score: number): boolean {
  return score >= PASS_THRESHOLD
}

export function getWrongQuestions<T extends { is_correct: boolean | null; is_idk: boolean }>(
  questions: T[]
): T[] {
  return questions.filter(q => q.is_correct === false || q.is_idk)
}

/** Pure grading function — determines correctness for a single answer. */
export function gradeAnswer(params: {
  answer: string | null
  isIdk: boolean
  correctAnswer: string
}): boolean {
  const { answer, isIdk, correctAnswer } = params
  return !isIdk && answer !== null && answer === correctAnswer
}
