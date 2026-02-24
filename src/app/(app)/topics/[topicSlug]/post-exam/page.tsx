'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExamPage } from '@/components/exam/exam-page'
import { PASS_THRESHOLD } from '@/lib/learning-loop/scoring'
import { Skeleton } from '@/components/ui/skeleton'

// States that indicate the post exam is already completed
const POST_EXAM_DONE_STATES = [
  'remediation_active',
  'remediation_lesson_pending',
  'remediation_lesson_active',
  'remediation_lesson_completed',
  'remediation_exam_pending',
  'remediation_exam_active',
  'remediation_exam_completed',
  'session_passed',
  'session_failed',
]

// States that indicate the remediation exam is already completed for this loop
const REMEDIATION_EXAM_DONE_STATES = ['session_passed', 'session_failed', 'remediation_active']

export default function PostExamPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const examType = (searchParams.get('type') === 'remediation' ? 'remediation' : 'post') as 'post' | 'remediation'
  const topicSlug = pathname.split('/topics/')[1]?.split('/')[0] ?? ''

  // checking = true while we verify the session state; prevents ExamPage from
  // firing init() and calling generateExam against an already-completed session.
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!sessionId) return

    const supabase = createClient()
    supabase
      .from('learning_sessions')
      .select('state')
      .eq('id', sessionId)
      .single()
      .then(({ data: session }) => {
        if (!session) {
          router.replace('/dashboard')
          return
        }

        const doneStates = examType === 'post' ? POST_EXAM_DONE_STATES : REMEDIATION_EXAM_DONE_STATES
        if (doneStates.includes(session.state)) {
          if (session.state === 'session_passed' || session.state === 'session_failed') {
            router.replace(`/topics/${topicSlug}`)
          } else {
            router.replace(`/topics/${topicSlug}/review?session=${sessionId}`)
          }
          return
        }

        setChecking(false)
      })
  }, [sessionId, examType, topicSlug, router])

  const handleReady = useCallback(async () => {
    const pendingState = examType === 'post' ? 'post_exam_pending' : 'remediation_exam_pending'
    await fetch('/api/session/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, targetState: pendingState }),
    })
  }, [sessionId, examType])

  const handleResultsReady = useCallback((id: string) => {
    fetch('/api/student-model/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id, examType }),
    }).catch(console.error)
  }, [examType])

  const handleContinue = useCallback(
    ({ score, topicSlug, sessionId: id }: { score: number; topicSlug: string; sessionId: string }) => {
      if (score >= PASS_THRESHOLD) {
        router.push(`/topics/${topicSlug}`)
      } else {
        router.push(`/topics/${topicSlug}/review?session=${id}`)
      }
    },
    [router]
  )

  const getContinueLabel = useCallback(
    (score: number) => score >= PASS_THRESHOLD ? 'Continue to Next Topic' : 'Start Review & Remediation',
    []
  )

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  if (checking) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Skeleton className="h-8 w-64 mx-auto" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const heading = examType === 'remediation' ? 'Remediation Exam' : 'Post-Exam: Assessment'

  return (
    <ExamPage
      examType={examType}
      sessionId={sessionId}
      heading={heading}
      subheading="Show what you've learned!"
      continueLabel={getContinueLabel}
      onContinue={handleContinue}
      onReady={handleReady}
      onResultsReady={handleResultsReady}
    />
  )
}
