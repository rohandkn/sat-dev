'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLesson } from '@/hooks/use-lesson'
import { LessonViewer } from '@/components/lesson/lesson-viewer'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'

export default function LessonPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const lessonType = (searchParams.get('type') ?? 'initial') as 'initial' | 'remediation'

  const { content, loading, streaming, error, complete, generateLesson } = useLesson()

  useEffect(() => {
    if (sessionId && !content && !loading && !streaming) {
      generateLesson(sessionId, lessonType)
    }
  }, [sessionId, content, loading, streaming, generateLesson, lessonType])

  if (!sessionId) {
    router.push('/dashboard')
    return null
  }

  const topicSlug = pathname.split('/topics/')[1]?.split('/')[0]

  if (error) {
    return (
      <div className="max-w-3xl mx-auto text-center space-y-4 py-12">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => generateLesson(sessionId, lessonType)}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {lessonType === 'remediation' ? 'Remediation Lesson' : 'Your Personalized Lesson'}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {lessonType === 'remediation'
            ? 'A targeted lesson covering the concepts you need to review'
            : 'Based on your pre-exam results, here\'s a lesson tailored to you'}
        </p>
      </div>

      <div className="min-h-[400px]">
        <LessonViewer content={content} loading={loading} streaming={streaming} />
      </div>

      {complete && (
        <div className="text-center space-y-4 border-t pt-6">
          <p className="text-muted-foreground text-sm">
            Ready to test your understanding?
          </p>
          <Button
            size="lg"
            onClick={() => {
              if (lessonType === 'remediation') {
                router.push(`/topics/${topicSlug}/post-exam?session=${sessionId}&type=remediation`)
              } else {
                router.push(`/topics/${topicSlug}/post-exam?session=${sessionId}`)
              }
            }}
          >
            {lessonType === 'remediation' ? 'Take Remediation Exam' : 'Take Post-Exam'}
          </Button>
        </div>
      )}
    </div>
  )
}
