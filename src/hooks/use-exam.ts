'use client'

import { useState, useCallback } from 'react'

interface ExamQuestion {
  id: string
  question_number: number
  question_text: string
  choices: Record<string, string>
  correct_answer: string
  explanation: string
}

interface Answer {
  questionId: string
  answer: string | null
  isIdk: boolean
}

interface ExamResult {
  questionId: string
  isCorrect: boolean
  isIdk: boolean
  userAnswer: string | null
  correctAnswer: string
  explanation: string
}

interface SubmitResponse {
  score: number
  results: ExamResult[]
  nextState: string
  hasWrongAnswers: boolean
}

export function useExam() {
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<SubmitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateExam = useCallback(async (sessionId: string, examType: 'pre' | 'post' | 'remediation') => {
    setLoading(true)
    setError(null)
    setResults(null)
    setCurrentIndex(0)
    setAnswers(new Map())

    try {
      const res = await fetch('/api/exam/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, examType }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate exam')
      }

      const data = await res.json()
      const sorted = data.questions.sort(
        (a: ExamQuestion, b: ExamQuestion) => a.question_number - b.question_number
      )
      setQuestions(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate exam')
    } finally {
      setLoading(false)
    }
  }, [])

  const selectAnswer = useCallback((questionId: string, answer: string) => {
    setAnswers(prev => {
      const next = new Map(prev)
      next.set(questionId, { questionId, answer, isIdk: false })
      return next
    })
  }, [])

  const selectIdk = useCallback((questionId: string) => {
    setAnswers(prev => {
      const next = new Map(prev)
      const current = next.get(questionId)
      if (current?.isIdk) {
        next.delete(questionId)
      } else {
        next.set(questionId, { questionId, answer: null, isIdk: true })
      }
      return next
    })
  }, [])

  const submitExam = useCallback(async (sessionId: string, examType: 'pre' | 'post' | 'remediation') => {
    setSubmitting(true)
    setError(null)

    try {
      // Fill in IDK for unanswered questions
      const allAnswers = questions.map(q => {
        const answer = answers.get(q.id)
        return answer ?? { questionId: q.id, answer: null, isIdk: true }
      })

      const res = await fetch('/api/exam/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, examType, answers: allAnswers }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit exam')
      }

      const data = await res.json()
      setResults(data)
      return data as SubmitResponse
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit exam')
      return null
    } finally {
      setSubmitting(false)
    }
  }, [questions, answers])

  const currentQuestion = questions[currentIndex] ?? null
  const currentAnswer = currentQuestion ? answers.get(currentQuestion.id) : null
  const hasAnsweredAll = questions.length > 0 && questions.every(q => answers.has(q.id))

  return {
    questions,
    answers,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions: questions.length,
    hasAnsweredAll,
    loading,
    submitting,
    results,
    error,
    generateExam,
    selectAnswer,
    selectIdk,
    submitExam,
    goToNext: () => setCurrentIndex(i => Math.min(i + 1, questions.length - 1)),
    goToPrev: () => setCurrentIndex(i => Math.max(i - 1, 0)),
    goToQuestion: (i: number) => setCurrentIndex(i),
  }
}
