'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useExam } from '@/hooks/use-exam'
import { QuestionCard } from '@/components/exam/question-card'
import { ExamProgress } from '@/components/exam/exam-progress'
import { ExamResults } from '@/components/exam/exam-results'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function PreExamPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

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

  useEffect(() => {
    if (sessionId && questions.length === 0 && !loading && !results) {
      generateExam(sessionId, 'pre')
    }
  }, [sessionId, questions.length, loading, results, generateExam])

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => generateExam(sessionId, 'pre')}>Try Again</Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Generating your pre-exam...</h2>
          <p className="text-muted-foreground text-sm">
            Creating personalized questions to assess your current understanding
          </p>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (results) {
    const topicSlug = window.location.pathname.split('/topics/')[1]?.split('/')[0]
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
        examType="pre"
        onContinue={() => router.push(`/topics/${topicSlug}/lesson?session=${sessionId}`)}
        continueLabel="Continue to Lesson"
      />
    )
  }

  if (!currentQuestion) return null

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Pre-Exam: Diagnostic Assessment</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Answer to the best of your ability. It&apos;s okay to say &quot;I don&apos;t know&quot;.
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
        <Button
          variant="outline"
          onClick={goToPrev}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>

        {currentIndex < totalQuestions - 1 ? (
          <Button onClick={goToNext}>
            Next
          </Button>
        ) : (
          <Button
            onClick={() => submitExam(sessionId, 'pre')}
            disabled={submitting || !hasAnsweredAll}
          >
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </Button>
        )}
      </div>

      {/* Question navigation dots */}
      <div className="flex justify-center gap-2 max-w-2xl mx-auto">
        {questions.map((q, i) => {
          const answer = (() => {
            const a = new Map<string, { isIdk: boolean; answer: string | null }>()
            // This is a simplified check
            return currentAnswer && currentQuestion?.id === q.id ? currentAnswer : undefined
          })()
          return (
            <button
              key={q.id}
              onClick={() => {
                const exam = document.querySelector('[data-exam]')
                if (exam) exam.scrollIntoView()
              }}
              className={`w-8 h-8 rounded-full text-xs font-medium border transition-colors
                ${i === currentIndex ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
