'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ExamPage } from '@/components/exam/exam-page'

export default function PreExamPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  return (
    <ExamPage
      examType="pre"
      sessionId={sessionId}
      heading="Pre-Exam: Diagnostic Assessment"
      subheading="Answer to the best of your ability. It's okay to say &quot;I don't know&quot;."
      continueLabel="Continue to Lesson"
      onContinue={({ topicSlug, sessionId: id }) =>
        router.push(`/topics/${topicSlug}/lesson?session=${id}`)
      }
    />
  )
}
