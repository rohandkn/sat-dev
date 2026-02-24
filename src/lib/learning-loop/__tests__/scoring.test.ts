import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  isPassing,
  getWrongQuestions,
  gradeAnswer,
  PASS_THRESHOLD,
  MAX_REMEDIATION_LOOPS,
  PRE_EXAM_QUESTION_COUNT,
  POST_EXAM_QUESTION_COUNT,
  REMEDIATION_EXAM_QUESTION_COUNT,
} from '../scoring'

describe('constants', () => {
  it('PASS_THRESHOLD is 80', () => expect(PASS_THRESHOLD).toBe(80))
  it('MAX_REMEDIATION_LOOPS is 3', () => expect(MAX_REMEDIATION_LOOPS).toBe(3))
  it('PRE_EXAM_QUESTION_COUNT is 5', () => expect(PRE_EXAM_QUESTION_COUNT).toBe(5))
  it('POST_EXAM_QUESTION_COUNT is 5', () => expect(POST_EXAM_QUESTION_COUNT).toBe(5))
  it('REMEDIATION_EXAM_QUESTION_COUNT is 3', () => expect(REMEDIATION_EXAM_QUESTION_COUNT).toBe(3))
})

describe('calculateScore', () => {
  it('returns 0 for empty array', () => {
    expect(calculateScore([])).toBe(0)
  })

  it('returns 100 when all correct', () => {
    const questions = [
      { is_correct: true },
      { is_correct: true },
      { is_correct: true },
    ]
    expect(calculateScore(questions)).toBe(100)
  })

  it('returns 0 when none correct', () => {
    const questions = [
      { is_correct: false },
      { is_correct: false },
    ]
    expect(calculateScore(questions)).toBe(0)
  })

  it('returns 80 for 4 out of 5 correct (post-exam passing threshold)', () => {
    const questions = [
      { is_correct: true },
      { is_correct: true },
      { is_correct: true },
      { is_correct: true },
      { is_correct: false },
    ]
    expect(calculateScore(questions)).toBe(80)
  })

  it('returns 60 for 3 out of 5 correct', () => {
    const questions = Array(5).fill(null).map((_, i) => ({ is_correct: i < 3 }))
    expect(calculateScore(questions)).toBe(60)
  })

  it('treats is_correct: null as incorrect (not answered)', () => {
    const questions = [
      { is_correct: true },
      { is_correct: null },
      { is_correct: null },
    ]
    expect(calculateScore(questions)).toBe(33)
  })

  it('rounds to nearest integer', () => {
    // 1/3 = 33.33...% → rounds to 33
    expect(calculateScore([{ is_correct: true }, { is_correct: false }, { is_correct: false }])).toBe(33)
    // 2/3 = 66.66...% → rounds to 67
    expect(calculateScore([{ is_correct: true }, { is_correct: true }, { is_correct: false }])).toBe(67)
  })
})

describe('isPassing', () => {
  it('returns true at exactly the threshold', () => {
    expect(isPassing(80)).toBe(true)
  })

  it('returns true above the threshold', () => {
    expect(isPassing(81)).toBe(true)
    expect(isPassing(100)).toBe(true)
  })

  it('returns false below the threshold', () => {
    expect(isPassing(79)).toBe(false)
    expect(isPassing(0)).toBe(false)
  })
})

describe('getWrongQuestions', () => {
  it('returns questions where is_correct is false', () => {
    const questions = [
      { is_correct: true, is_idk: false, id: '1' },
      { is_correct: false, is_idk: false, id: '2' },
      { is_correct: null, is_idk: false, id: '3' },
    ]
    const wrong = getWrongQuestions(questions)
    expect(wrong.map(q => q.id)).toEqual(['2'])
  })

  it('returns questions where is_idk is true', () => {
    const questions = [
      { is_correct: null, is_idk: true, id: '1' },
      { is_correct: true, is_idk: false, id: '2' },
    ]
    const wrong = getWrongQuestions(questions)
    expect(wrong.map(q => q.id)).toEqual(['1'])
  })

  it('includes both wrong and idk questions', () => {
    const questions = [
      { is_correct: false, is_idk: false, id: '1' },
      { is_correct: null, is_idk: true, id: '2' },
      { is_correct: true, is_idk: false, id: '3' },
    ]
    expect(getWrongQuestions(questions)).toHaveLength(2)
  })

  it('returns empty array when all correct', () => {
    const questions = [
      { is_correct: true, is_idk: false },
      { is_correct: true, is_idk: false },
    ]
    expect(getWrongQuestions(questions)).toHaveLength(0)
  })
})

describe('gradeAnswer', () => {
  it('returns true when answer matches correctAnswer and is not idk', () => {
    expect(gradeAnswer({ answer: 'A', isIdk: false, correctAnswer: 'A' })).toBe(true)
  })

  it('returns false when answer does not match correctAnswer', () => {
    expect(gradeAnswer({ answer: 'B', isIdk: false, correctAnswer: 'A' })).toBe(false)
  })

  it('returns false when isIdk is true even if answer matches', () => {
    expect(gradeAnswer({ answer: 'A', isIdk: true, correctAnswer: 'A' })).toBe(false)
  })

  it('returns false when answer is null', () => {
    expect(gradeAnswer({ answer: null, isIdk: false, correctAnswer: 'A' })).toBe(false)
  })

  it('returns false when both isIdk and answer is null', () => {
    expect(gradeAnswer({ answer: null, isIdk: true, correctAnswer: 'A' })).toBe(false)
  })

  it('is case-sensitive — A !== a', () => {
    expect(gradeAnswer({ answer: 'a', isIdk: false, correctAnswer: 'A' })).toBe(false)
  })

  it('handles all valid multiple-choice keys', () => {
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(gradeAnswer({ answer: key, isIdk: false, correctAnswer: key })).toBe(true)
    }
  })
})
