'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useExam } from '@/hooks/use-exam'
import { QuestionCard } from '@/components/exam/question-card'
import { ExamProgress } from '@/components/exam/exam-progress'
import { ExamResults } from '@/components/exam/exam-results'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface ExamPageProps {
  examType: 'pre' | 'post' | 'remediation'
  sessionId: string
  heading: string
  subheading: string
  /** Static label or a function receiving the score to compute the label dynamically */
  continueLabel: string | ((score: number) => string)
  onContinue: (params: { score: number; topicSlug: string; sessionId: string }) => void
  /** Optional async step to run before exam generation (e.g. server-side state transition) */
  onReady?: () => Promise<void>
  /** Optional fire-and-forget side effect triggered once when results arrive */
  onResultsReady?: (sessionId: string) => void
}

export function ExamPage({
  examType,
  sessionId,
  heading,
  subheading,
  continueLabel,
  onContinue,
  onReady,
  onResultsReady,
}: ExamPageProps) {
  const pathname = usePathname()
  const topicSlug = pathname.split('/topics/')[1]?.split('/')[0] ?? ''

  // Keep latest callback refs so effects don't need them as dependencies,
  // avoiding spurious re-runs when parent re-renders with new function references.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onResultsReadyRef = useRef(onResultsReady)
  onResultsReadyRef.current = onResultsReady

  // Prevent React Strict Mode's double-invocation from firing two concurrent
  // exam generations. Once init() has been called once, skip subsequent calls.
  const startedRef = useRef(false)

  const {
    questions,
    answers,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions,
    hasAnsweredAll,
    loading,
    submitting,
    results,
    error,
    generateExam,
    selectAnswer,
    selectIdk,
    submitExam,
    goToNext,
    goToPrev,
    goToQuestion,
  } = useExam()

  useEffect(() => {
    if (questions.length > 0 || loading || results || startedRef.current) return
    startedRef.current = true

    async function init() {
      if (onReadyRef.current) await onReadyRef.current()
      generateExam(sessionId, examType)
    }
    init()
  }, [sessionId, questions.length, loading, results, examType, generateExam])

  useEffect(() => {
    if (results && onResultsReadyRef.current) {
      onResultsReadyRef.current(sessionId)
    }
  }, [results, sessionId])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => generateExam(sessionId, examType)}>Try Again</Button>
      </div>
    )
  }

  if (loading) {
    const loadingText = examType === 'pre'
      ? 'Creating personalized questions to assess your current understanding'
      : 'Creating questions to test what you\'ve learned'
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Generating your {examType}-exam...</h2>
          <p className="text-muted-foreground text-sm">{loadingText}</p>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (results) {
    const label = typeof continueLabel === 'function' ? continueLabel(results.score) : continueLabel
    return (
      <ExamResults
        score={results.score}
        results={results.results}
        questions={questions.map(q => {
          const r = results.results.find(r => r.questionId === q.id)
          return {
            ...q,
            user_answer: r?.isIdk ? null : (r?.userAnswer ?? null),
            is_idk: r?.isIdk ?? false,
          }
        })}
        examType={examType}
        onContinue={() => onContinue({ score: results.score, topicSlug, sessionId })}
        continueLabel={label}
      />
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">{heading}</h2>
        <p className="text-muted-foreground text-sm mt-1">{subheading}</p>
      </div>

      <ExamProgress currentQuestion={currentIndex + 1} totalQuestions={totalQuestions} />

      <QuestionCard
        questionNumber={currentIndex + 1}
        totalQuestions={totalQuestions}
        questionText={currentQuestion.question_text}
        choices={currentQuestion.choices as Record<string, string>}
        selectedAnswer={currentAnswer?.isIdk ? null : (currentAnswer?.answer ?? null)}
        isIdk={currentAnswer?.isIdk ?? false}
        onSelectAnswer={(answer) => selectAnswer(currentQuestion.id, answer)}
        onIdk={() => selectIdk(currentQuestion.id)}
      />

      <div className="flex justify-between max-w-2xl mx-auto">
        <Button variant="outline" onClick={goToPrev} disabled={currentIndex === 0}>
          Previous
        </Button>
        {currentIndex < totalQuestions - 1 ? (
          <Button onClick={goToNext}>Next</Button>
        ) : (
          <Button
            onClick={() => submitExam(sessionId, examType)}
            disabled={submitting || !hasAnsweredAll}
          >
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </Button>
        )}
      </div>

      {/* Question navigation dots — answered questions shown with muted highlight */}
      <div className="flex justify-center gap-2 max-w-2xl mx-auto">
        {questions.map((q, i) => {
          const isAnswered = answers.has(q.id)
          return (
            <button
              type="button"
              key={q.id}
              onClick={() => goToQuestion(i)}
              className={`w-8 h-8 rounded-full text-xs font-medium border transition-colors
                ${i === currentIndex
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isAnswered
                    ? 'bg-primary/20 border-primary/40 hover:bg-primary/30'
                    : 'bg-background border-border hover:bg-accent'
                }`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
