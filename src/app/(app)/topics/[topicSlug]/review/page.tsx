'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { RemediationChat } from '@/components/remediation/remediation-chat'
import { useRemediation } from '@/hooks/use-remediation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface WrongQuestion {
  id: string
  question_text: string
  choices: Record<string, string>
  correct_answer: string
  user_answer: string | null
  is_idk: boolean
  explanation: string
}

export default function ReviewPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const supabase = createClient()

  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [resolvedQuestions, setResolvedQuestions] = useState<Set<string>>(new Set())
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const remediation = useRemediation()

  const topicSlug = pathname.split('/topics/')[1]?.split('/')[0]

  // Load wrong questions and session state
  useEffect(() => {
    if (!sessionId) return

    async function load() {
      // Show wrong questions from the MOST RECENT exam only — not accumulated
      // across prior loops.  Find the latest exam by created_at and filter by
      // its exam_type + attempt_number.
      const { data: latestExamRow } = await supabase
        .from('exam_questions')
        .select('exam_type, attempt_number')
        .eq('session_id', sessionId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const examType = latestExamRow?.exam_type ?? 'post'
      const attemptNumber = latestExamRow?.attempt_number ?? 1

      const { data: questions } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('session_id', sessionId!)
        .eq('exam_type', examType)
        .eq('attempt_number', attemptNumber)
        .or('is_correct.eq.false,is_idk.eq.true')
        .order('question_number')

      if (questions && questions.length > 0) {
        setWrongQuestions(questions.map(q => ({
          ...q,
          choices: q.choices as Record<string, string>,
        })))
      }

      // Check existing threads — only for the current exam's questions.
      // Order by created_at DESC so the LATEST thread per question wins
      // (guards against stale resolved threads if deletion failed).
      const { data: threads } = await supabase
        .from('remediation_threads')
        .select('question_id, is_resolved, created_at, exam_questions!inner(attempt_number, exam_type)')
        .eq('session_id', sessionId!)
        .eq('exam_questions.exam_type', examType)
        .eq('exam_questions.attempt_number', attemptNumber)
        .order('created_at', { ascending: false })

      if (threads) {
        const resolved = new Set<string>()
        const seen = new Set<string>()
        threads.forEach(t => {
          // Only consider the newest thread per question
          if (seen.has(t.question_id)) return
          seen.add(t.question_id)
          if (t.is_resolved) resolved.add(t.question_id)
        })
        setResolvedQuestions(resolved)
      }

      setLoadingQuestions(false)
    }

    load()
  }, [sessionId, supabase])

  // Start remediation for current question
  useEffect(() => {
    if (
      wrongQuestions.length > 0 &&
      currentQuestionIndex < wrongQuestions.length &&
      sessionId &&
      !remediation.threadId &&
      !remediation.loading &&
      !remediation.streaming
    ) {
      const q = wrongQuestions[currentQuestionIndex]
      if (!resolvedQuestions.has(q.id)) {
        remediation.startThread(q.id, sessionId)
      }
    }
  }, [currentQuestionIndex, wrongQuestions, sessionId, remediation, resolvedQuestions])

  const handleQuestionResolved = useCallback(() => {
    const q = wrongQuestions[currentQuestionIndex]
    if (q) {
      setResolvedQuestions(prev => {
        const next = new Set(prev)
        next.add(q.id)
        return next
      })
    }
  }, [currentQuestionIndex, wrongQuestions])

  // Track when remediation is resolved
  useEffect(() => {
    if (remediation.isResolved) {
      handleQuestionResolved()
    }
  }, [remediation.isResolved, handleQuestionResolved])

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  if (loadingQuestions) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 py-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const resolvedCount = wrongQuestions.filter(q => resolvedQuestions.has(q.id)).length
  const allResolved = wrongQuestions.every(q => resolvedQuestions.has(q.id))
  const currentQuestion = wrongQuestions[currentQuestionIndex]

  async function handleContinueToLesson() {
    if (!sessionId) return

    // Transition to remediation_lesson_pending
    await supabase
      .from('learning_sessions')
      .update({
        state: 'remediation_lesson_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    router.push(`/topics/${topicSlug}/lesson?session=${sessionId}&type=remediation`)
  }

  function moveToNextQuestion() {
    remediation.reset()
    setCurrentQuestionIndex(prev => Math.min(prev + 1, wrongQuestions.length - 1))
  }

  function moveToPrevQuestion() {
    remediation.reset()
    setCurrentQuestionIndex(prev => Math.max(prev - 1, 0))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Review & Remediation</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Let&apos;s work through the questions you missed
        </p>
      </div>

      {/* Question navigation */}
      <div className="flex items-center justify-center gap-2">
        {wrongQuestions.map((q, i) => (
          <button
            type="button"
            key={q.id}
            onClick={() => {
              remediation.reset()
              setCurrentQuestionIndex(i)
            }}
            className={`w-10 h-10 rounded-full text-sm font-medium border transition-colors flex items-center justify-center
              ${i === currentQuestionIndex ? 'bg-primary text-primary-foreground' : ''}
              ${resolvedQuestions.has(q.id) ? 'border-green-500 text-green-600' : 'border-border'}
            `}
          >
            {resolvedQuestions.has(q.id) ? 'V' : i + 1}
          </button>
        ))}
      </div>

      {/* Progress */}
      <div className="text-center text-sm text-muted-foreground">
        {resolvedCount} of {wrongQuestions.length} questions resolved
      </div>

      {/* Current question remediation — keep chat visible even after resolved so
          the student can read the final response before navigating away */}
      {currentQuestion && (
        <div className="h-[min(500px,calc(100vh-22rem))]">
          <RemediationChat
            questionText={currentQuestion.question_text}
            questionChoices={currentQuestion.choices}
            userAnswer={currentQuestion.user_answer}
            isIdk={currentQuestion.is_idk}
            correctAnswer={currentQuestion.correct_answer}
            messages={remediation.messages}
            loading={remediation.loading}
            streaming={remediation.streaming}
            isResolved={remediation.isResolved || resolvedQuestions.has(currentQuestion.id)}
            error={remediation.error}
            onSendMessage={remediation.sendMessage}
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={moveToPrevQuestion}
          disabled={currentQuestionIndex === 0}
        >
          Previous Question
        </Button>

        {currentQuestionIndex < wrongQuestions.length - 1 ? (
          <Button onClick={moveToNextQuestion}>
            Next Question
          </Button>
        ) : allResolved ? (
          <Button onClick={handleContinueToLesson} size="lg">
            Continue to Remediation Lesson
          </Button>
        ) : (
          <Button disabled>
            Resolve all questions to continue
          </Button>
        )}
      </div>
    </div>
  )
}
