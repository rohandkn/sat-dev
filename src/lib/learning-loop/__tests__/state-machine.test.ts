import { describe, it, expect } from 'vitest'
import { canTransition, getNextState, SESSION_STATES } from '../state-machine'

describe('canTransition', () => {
  describe('valid transitions', () => {
    const validTransitions: Array<[string, string]> = [
      ['pre_exam_pending', 'pre_exam_active'],
      ['pre_exam_active', 'pre_exam_completed'],
      ['pre_exam_completed', 'lesson_pending'],
      ['lesson_pending', 'lesson_active'],
      ['lesson_active', 'lesson_completed'],
      ['lesson_completed', 'post_exam_pending'],
      ['post_exam_pending', 'post_exam_active'],
      ['post_exam_active', 'post_exam_completed'],
      ['post_exam_completed', 'session_passed'],
      ['post_exam_completed', 'remediation_active'],
      ['remediation_active', 'remediation_lesson_pending'],
      ['remediation_lesson_pending', 'remediation_lesson_active'],
      ['remediation_lesson_active', 'remediation_lesson_completed'],
      ['remediation_lesson_completed', 'remediation_exam_pending'],
      ['remediation_exam_pending', 'remediation_exam_active'],
      ['remediation_exam_active', 'remediation_exam_completed'],
      ['remediation_exam_completed', 'session_passed'],
      ['remediation_exam_completed', 'remediation_active'],
      ['remediation_exam_completed', 'session_failed'],
    ]

    it.each(validTransitions)('%s → %s is allowed', (from, to) => {
      expect(canTransition(from, to)).toBe(true)
    })
  })

  describe('invalid transitions', () => {
    const invalidTransitions: Array<[string, string]> = [
      // Skipping states
      ['pre_exam_pending', 'pre_exam_completed'],
      ['pre_exam_pending', 'lesson_pending'],
      ['pre_exam_active', 'lesson_pending'],
      // Going backwards
      ['pre_exam_completed', 'pre_exam_active'],
      ['lesson_completed', 'lesson_active'],
      ['post_exam_completed', 'post_exam_active'],
      // Jumping across phases
      ['pre_exam_completed', 'post_exam_pending'],
      ['lesson_completed', 'remediation_active'],
      // Terminal states have no outgoing transitions
      ['session_passed', 'pre_exam_pending'],
      ['session_failed', 'pre_exam_pending'],
      ['session_passed', 'session_failed'],
      // Unknown state
      ['unknown_state', 'pre_exam_active'],
    ]

    it.each(invalidTransitions)('%s → %s is not allowed', (from, to) => {
      expect(canTransition(from, to)).toBe(false)
    })
  })

  it('returns false for unknown current state', () => {
    expect(canTransition('not_a_real_state', 'pre_exam_active')).toBe(false)
  })

  it('returns false for unknown target state even from a valid current state', () => {
    expect(canTransition('pre_exam_pending', 'not_a_real_state')).toBe(false)
  })
})

describe('getNextState', () => {
  describe('post_exam_completed', () => {
    it('returns session_passed when score >= 80', () => {
      expect(getNextState('post_exam_completed', { examScore: 80 })).toBe('session_passed')
      expect(getNextState('post_exam_completed', { examScore: 100 })).toBe('session_passed')
      expect(getNextState('post_exam_completed', { examScore: 81 })).toBe('session_passed')
    })

    it('returns remediation_active when score < 80', () => {
      expect(getNextState('post_exam_completed', { examScore: 79 })).toBe('remediation_active')
      expect(getNextState('post_exam_completed', { examScore: 0 })).toBe('remediation_active')
      expect(getNextState('post_exam_completed', { examScore: 60 })).toBe('remediation_active')
    })

    it('returns remediation_active when examScore is undefined', () => {
      expect(getNextState('post_exam_completed', {})).toBe('remediation_active')
    })
  })

  describe('remediation_exam_completed', () => {
    it('returns session_passed when score >= 80 regardless of loop count', () => {
      expect(getNextState('remediation_exam_completed', { examScore: 80, remediationLoopCount: 0 })).toBe('session_passed')
      expect(getNextState('remediation_exam_completed', { examScore: 80, remediationLoopCount: 2 })).toBe('session_passed')
      expect(getNextState('remediation_exam_completed', { examScore: 100, remediationLoopCount: 3 })).toBe('session_passed')
    })

    it('returns session_failed when score < 80 and loop count >= 3', () => {
      expect(getNextState('remediation_exam_completed', { examScore: 79, remediationLoopCount: 3 })).toBe('session_failed')
      expect(getNextState('remediation_exam_completed', { examScore: 0, remediationLoopCount: 4 })).toBe('session_failed')
    })

    it('returns remediation_active when score < 80 and loop count < 3', () => {
      expect(getNextState('remediation_exam_completed', { examScore: 79, remediationLoopCount: 0 })).toBe('remediation_active')
      expect(getNextState('remediation_exam_completed', { examScore: 79, remediationLoopCount: 1 })).toBe('remediation_active')
      expect(getNextState('remediation_exam_completed', { examScore: 79, remediationLoopCount: 2 })).toBe('remediation_active')
    })

    it('uses remediationLoopCount = 0 as default', () => {
      expect(getNextState('remediation_exam_completed', { examScore: 79 })).toBe('remediation_active')
    })
  })

  it('returns empty string for states not handled by getNextState', () => {
    expect(getNextState('pre_exam_completed', {})).toBe('')
    expect(getNextState('lesson_completed', {})).toBe('')
    expect(getNextState('unknown_state', {})).toBe('')
  })

  describe('post_exam and remediation_exam pass threshold is consistent', () => {
    it('both branches pass at exactly 80', () => {
      expect(getNextState('post_exam_completed', { examScore: 80 })).toBe('session_passed')
      expect(getNextState('remediation_exam_completed', { examScore: 80 })).toBe('session_passed')
    })

    it('both branches fail at 79', () => {
      expect(getNextState('post_exam_completed', { examScore: 79 })).toBe('remediation_active')
      expect(getNextState('remediation_exam_completed', { examScore: 79, remediationLoopCount: 0 })).toBe('remediation_active')
    })
  })
})

describe('SESSION_STATES', () => {
  it('contains all 18 expected states', () => {
    // CLAUDE.md says "17 states" but the actual count is 18 (session_failed was added)
    expect(SESSION_STATES).toHaveLength(18)
  })

  it('starts with pre_exam_pending and ends with terminal states', () => {
    expect(SESSION_STATES[0]).toBe('pre_exam_pending')
    expect(SESSION_STATES).toContain('session_passed')
    expect(SESSION_STATES).toContain('session_failed')
  })
})
