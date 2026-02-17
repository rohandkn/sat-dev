export const SESSION_STATES = [
  'pre_exam_pending',
  'pre_exam_active',
  'pre_exam_completed',
  'lesson_pending',
  'lesson_active',
  'lesson_completed',
  'post_exam_pending',
  'post_exam_active',
  'post_exam_completed',
  'remediation_active',
  'remediation_lesson_pending',
  'remediation_lesson_active',
  'remediation_lesson_completed',
  'remediation_exam_pending',
  'remediation_exam_active',
  'remediation_exam_completed',
  'session_passed',
  'session_failed',
] as const

export type SessionState = typeof SESSION_STATES[number]

// Valid state transitions
const TRANSITIONS: Record<string, string[]> = {
  pre_exam_pending: ['pre_exam_active'],
  pre_exam_active: ['pre_exam_completed'],
  pre_exam_completed: ['lesson_pending'],
  lesson_pending: ['lesson_active'],
  lesson_active: ['lesson_completed'],
  lesson_completed: ['post_exam_pending'],
  post_exam_pending: ['post_exam_active'],
  post_exam_active: ['post_exam_completed'],
  post_exam_completed: ['session_passed', 'remediation_active'],
  remediation_active: ['remediation_lesson_pending'],
  remediation_lesson_pending: ['remediation_lesson_active'],
  remediation_lesson_active: ['remediation_lesson_completed'],
  remediation_lesson_completed: ['remediation_exam_pending'],
  remediation_exam_pending: ['remediation_exam_active'],
  remediation_exam_active: ['remediation_exam_completed'],
  remediation_exam_completed: ['session_passed', 'remediation_active', 'session_failed'],
}

export function canTransition(currentState: string, nextState: string): boolean {
  const allowed = TRANSITIONS[currentState]
  return allowed ? allowed.includes(nextState) : false
}

export function getNextState(currentState: string, context: {
  examScore?: number
  hasWrongAnswers?: boolean
  remediationLoopCount?: number
}): string {
  const { examScore, hasWrongAnswers, remediationLoopCount = 0 } = context

  switch (currentState) {
    case 'post_exam_completed':
      if (examScore !== undefined && examScore >= 80 && !hasWrongAnswers) {
        return 'session_passed'
      }
      return 'remediation_active'

    case 'remediation_exam_completed':
      if (examScore !== undefined && examScore >= 80) {
        return 'session_passed'
      }
      if (remediationLoopCount >= 3) {
        return 'session_failed'
      }
      return 'remediation_active'

    default:
      return ''
  }
}

export function getStateLabel(state: string): string {
  const labels: Record<string, string> = {
    pre_exam_pending: 'Ready for Pre-Exam',
    pre_exam_active: 'Taking Pre-Exam',
    pre_exam_completed: 'Pre-Exam Complete',
    lesson_pending: 'Ready for Lesson',
    lesson_active: 'Viewing Lesson',
    lesson_completed: 'Lesson Complete',
    post_exam_pending: 'Ready for Post-Exam',
    post_exam_active: 'Taking Post-Exam',
    post_exam_completed: 'Post-Exam Complete',
    remediation_active: 'Remediation in Progress',
    remediation_lesson_pending: 'Ready for Remediation Lesson',
    remediation_lesson_active: 'Viewing Remediation Lesson',
    remediation_lesson_completed: 'Remediation Lesson Complete',
    remediation_exam_pending: 'Ready for Remediation Exam',
    remediation_exam_active: 'Taking Remediation Exam',
    remediation_exam_completed: 'Remediation Exam Complete',
    session_passed: 'Topic Passed',
    session_failed: 'Needs More Practice',
  }
  return labels[state] ?? state
}
