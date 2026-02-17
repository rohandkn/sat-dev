'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useExam } from '@/hooks/use-exam'
import { QuestionCard } from '@/components/exam/question-card'
import { ExamProgress } from '@/components/exam/exam-progress'
import { ExamResults } from '@/components/exam/exam-results'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { PASS_THRESHOLD } from '@/lib/learning-loop/scoring'

export default function PostExamPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const examType = (searchParams.get('type') === 'remediation' ? 'remediation' : 'post') as 'post' | 'remediation'
  const [sessionState, setSessionState] = useState<string | null>(null)

  const {
    questions,
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
  } = useExam()

  // Transition session state before generating
  useEffect(() => {
    if (!sessionId || questions.length > 0 || loading || results) return

    async function prepareAndGenerate() {
      const supabase = createClient()
      const { data: session } = await supabase
        .from('learning_sessions')
        .select('state')
        .eq('id', sessionId!)
        .single()

      if (!session) return

      const pendingState = examType === 'post' ? 'post_exam_pending' : 'remediation_exam_pending'
      if (session.state === 'lesson_completed' || session.state === 'remediation_lesson_completed') {
        await supabase
          .from('learning_sessions')
          .update({ state: pendingState, updated_at: new Date().toISOString() })
          .eq('id', sessionId!)
        setSessionState(pendingState)
      } else {
        setSessionState(session.state)
      }

      generateExam(sessionId!, examType)
    }

    prepareAndGenerate()
  }, [sessionId, questions.length, loading, results, examType, generateExam])

  // Trigger student model update after results — must be before any early returns
  useEffect(() => {
    if (results && sessionId) {
      fetch('/api/student-model/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, examType }),
      }).catch(console.error)
    }
  }, [results, sessionId, examType])

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  const topicSlug = pathname.split('/topics/')[1]?.split('/')[0]

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => generateExam(sessionId, examType)}>Try Again</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">
            Generating your {examType === 'remediation' ? 'remediation' : 'post'}-exam...
          </h2>
          <p className="text-muted-foreground text-sm">
            Creating questions to test what you&apos;ve learned
          </p>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (results) {
    const passed = results.score >= PASS_THRESHOLD

    function handleContinue() {
      if (passed) {
        router.push(`/topics/${topicSlug}`)
      } else {
        router.push(`/topics/${topicSlug}/review?session=${sessionId}`)
      }
    }

    return (
      <ExamResults
        score={results.score}
        results={results.results}
        questions={questions.map(q => {
          const r = results.results.find(r => r.questionId === q.id)
          return {
            ...q,
            user_answer: r?.isIdk ? null : (r?.correctAnswer ?? null),
            is_idk: r?.isIdk ?? false,
          }
        })}
        examType={examType}
        onContinue={handleContinue}
        continueLabel={passed ? 'Continue to Next Topic' : 'Start Review & Remediation'}
      />
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {examType === 'remediation' ? 'Remediation Exam' : 'Post-Exam: Assessment'}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Show what you&apos;ve learned!
        </p>
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
    </div>
  )
}
