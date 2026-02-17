'use client'

import { MarkdownRenderer } from '@/components/math/markdown-renderer'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

interface LessonViewerProps {
  content: string
  loading: boolean
  streaming: boolean
}

export function LessonViewer({ content, loading, streaming }: LessonViewerProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="pb-8">
        <MarkdownRenderer content={content} />
        {streaming && (
          <span className="inline-block w-2 h-5 bg-primary animate-pulse ml-1" />
        )}
      </div>
    </ScrollArea>
  )
}
