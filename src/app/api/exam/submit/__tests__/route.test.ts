import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

// ── Chainable Supabase mock ───────────────────────────────────────────────────
// The Supabase query builder is a fluent chain where every method returns the
// same builder. The chain is executed when awaited (via .then) or via .single().
// This factory builds a builder that resolves to `result` at the end of any chain.

function makeBuilder(result: { data: unknown; error: unknown }) {
  const p = Promise.resolve(result)
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    update: () => builder,
    upsert: () => p,
    single: () => p,
    // Make the builder itself awaitable (for chains that don't end in .single())
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  return builder
}

// Shared mutable state the mock reads from
const mockState = {
  user: { id: 'user-1' } as { id: string } | null,
  session: null as Record<string, unknown> | null,
  questions: [] as Record<string, unknown>[],
  upsertError: null as unknown,
  updateError: null as unknown,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockState.user } }),
    },
    from: (table: string) => {
      if (table === 'learning_sessions') {
        return {
          // SELECT single session
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: mockState.session, error: null }),
              }),
            }),
          }),
          // UPDATE session state
          update: () => makeBuilder({ data: null, error: mockState.updateError }),
        }
      }

      if (table === 'exam_questions') {
        return {
          // SELECT questions by IDs (no .single() — awaited directly)
          select: () => makeBuilder({ data: mockState.questions, error: null }),
          // UPSERT graded answers
          upsert: async () => ({ data: null, error: mockState.upsertError }),
        }
      }

      return makeBuilder({ data: null, error: null })
    },
  }),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/exam/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const TOPIC_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const Q1_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const Q2_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const UNKNOWN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

function makeQuestion(id: string, n: number, correctAnswer = 'B') {
  return {
    id,
    session_id: SESSION_ID,
    user_id: 'user-1',
    exam_type: 'pre',
    question_number: n,
    question_text: `Question ${n}`,
    choices: { A: 'Wrong', B: 'Right', C: 'Also wrong', D: 'Still wrong' },
    correct_answer: correctAnswer,
    explanation: 'Explanation.',
    user_answer: null,
    is_correct: null,
    is_idk: false,
    created_at: new Date().toISOString(),
  }
}

const baseQuestions = [makeQuestion(Q1_ID, 1), makeQuestion(Q2_ID, 2)]

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: 'user-1',
    topic_id: TOPIC_ID,
    state: 'pre_exam_active',
    remediation_loop_count: 0,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('POST /api/exam/submit', () => {
  beforeEach(() => {
    mockState.user = { id: 'user-1' }
    mockState.session = baseSession()
    mockState.questions = baseQuestions
    mockState.upsertError = null
    mockState.updateError = null
  })

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockState.user = null
      const res = await POST(makeRequest({ sessionId: SESSION_ID, examType: 'pre', answers: [] }))
      expect(res.status).toBe(401)
    })
  })

  describe('input validation', () => {
    it('returns 400 for missing body fields', async () => {
      const res = await POST(makeRequest({ invalid: true }))
      expect(res.status).toBe(400)
    })

    it('returns 400 for non-UUID sessionId', async () => {
      const res = await POST(makeRequest({ sessionId: 'not-a-uuid', examType: 'pre', answers: [] }))
      expect(res.status).toBe(400)
    })

    it('returns 400 for unknown examType', async () => {
      const res = await POST(makeRequest({ sessionId: SESSION_ID, examType: 'final', answers: [] }))
      expect(res.status).toBe(400)
    })
  })

  describe('session guards', () => {
    it('returns 404 when session is not found', async () => {
      mockState.session = null
      const res = await POST(makeRequest({ sessionId: SESSION_ID, examType: 'pre', answers: [] }))
      expect(res.status).toBe(404)
    })

    it('returns 400 when session is in a different active state than expected', async () => {
      mockState.session = baseSession({ state: 'pre_exam_pending' })
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [{ questionId: Q1_ID, answer: 'B', isIdk: false }],
      }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatch(/pre_exam_active/)
    })

    it('returns 400 when submitting post-exam while session is in pre_exam_active', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'post',
        answers: [{ questionId: Q1_ID, answer: 'B', isIdk: false }],
      }))
      expect(res.status).toBe(400)
    })
  })

  describe('grading', () => {
    it('marks a correct answer as isCorrect: true and returns 200', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: false },
          { questionId: Q2_ID, answer: 'B', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(100)
      expect(body.results.find((r: { questionId: string }) => r.questionId === Q1_ID).isCorrect).toBe(true)
    })

    it('marks a wrong answer as isCorrect: false and reduces score', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: Q1_ID, answer: 'A', isIdk: false },  // wrong
          { questionId: Q2_ID, answer: 'B', isIdk: false },  // correct
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(50)
      expect(body.results.find((r: { questionId: string }) => r.questionId === Q1_ID).isCorrect).toBe(false)
    })

    it('marks isIdk: true as isCorrect: false regardless of answer value', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: true },   // idk overrides correct answer
          { questionId: Q2_ID, answer: 'B', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const q1Result = body.results.find((r: { questionId: string }) => r.questionId === Q1_ID)
      expect(q1Result.isCorrect).toBe(false)
      expect(q1Result.isIdk).toBe(true)
    })

    it('includes userAnswer and correctAnswer in each result', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [{ questionId: Q1_ID, answer: 'A', isIdk: false }],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      const result = body.results[0]
      expect(result.userAnswer).toBe('A')
      expect(result.correctAnswer).toBe('B')
    })

    it('skips answer entries whose question ID is not in the DB', async () => {
      // UNKNOWN_ID is not in mockState.questions — should be silently skipped
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: UNKNOWN_ID, answer: 'A', isIdk: false },
          { questionId: Q1_ID, answer: 'B', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only Q1 was graded; UNKNOWN_ID was skipped
      expect(body.results).toHaveLength(1)
      expect(body.results[0].questionId).toBe(Q1_ID)
    })
  })

  describe('state transitions', () => {
    it('pre-exam with score < 100 returns nextState: pre_exam_completed', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: false },  // correct
          { questionId: Q2_ID, answer: 'A', isIdk: false },  // wrong
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(50)
      expect(body.nextState).toBe('pre_exam_completed')
    })

    it('pre-exam with perfect 100% score skips to session_passed', async () => {
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: false },
          { questionId: Q2_ID, answer: 'B', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(100)
      expect(body.nextState).toBe('session_passed')
    })

    it('post-exam with score >= 80 transitions to session_passed', async () => {
      mockState.session = baseSession({ state: 'post_exam_active' })
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'post',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: false },
          { questionId: Q2_ID, answer: 'B', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(100)
      expect(body.nextState).toBe('session_passed')
    })

    it('post-exam with score < 80 transitions to remediation_active', async () => {
      mockState.session = baseSession({ state: 'post_exam_active' })
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'post',
        answers: [
          { questionId: Q1_ID, answer: 'A', isIdk: false },
          { questionId: Q2_ID, answer: 'A', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(0)
      expect(body.nextState).toBe('remediation_active')
    })

    it('post-exam at exactly 80% passes (4 out of 5 correct)', async () => {
      const q3 = makeQuestion('11111111-1111-4111-8111-111111111111', 3)
      const q4 = makeQuestion('22222222-2222-4222-8222-222222222222', 4)
      const q5 = makeQuestion('33333333-3333-4333-8333-333333333333', 5)
      mockState.questions = [...baseQuestions, q3, q4, q5]
      mockState.session = baseSession({ state: 'post_exam_active' })

      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'post',
        answers: [
          { questionId: Q1_ID, answer: 'B', isIdk: false },         // correct
          { questionId: Q2_ID, answer: 'B', isIdk: false },         // correct
          { questionId: q3.id, answer: 'B', isIdk: false },         // correct
          { questionId: q4.id, answer: 'B', isIdk: false },         // correct
          { questionId: q5.id, answer: 'A', isIdk: false },         // wrong — 4/5 = 80%
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.score).toBe(80)
      expect(body.nextState).toBe('session_passed')  // 80% should pass
    })

    it('remediation-exam at loop count 3 transitions to session_failed on score < 80', async () => {
      mockState.session = baseSession({ state: 'remediation_exam_active', remediation_loop_count: 3 })
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'remediation',
        answers: [
          { questionId: Q1_ID, answer: 'A', isIdk: false },
          { questionId: Q2_ID, answer: 'A', isIdk: false },
        ],
      }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.nextState).toBe('session_failed')
    })
  })

  describe('error handling', () => {
    it('returns 500 when DB upsert fails', async () => {
      mockState.upsertError = { message: 'DB connection error' }
      const res = await POST(makeRequest({
        sessionId: SESSION_ID,
        examType: 'pre',
        answers: [{ questionId: Q1_ID, answer: 'B', isIdk: false }],
      }))
      expect(res.status).toBe(500)
    })
  })
})
