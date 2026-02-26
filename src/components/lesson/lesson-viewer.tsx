'use client'

import type { Components } from 'react-markdown'
import { MarkdownRenderer } from '@/components/math/markdown-renderer'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

// Lesson-specific markdown components.
// Visual hierarchy: H1 = page title, H2 = major section (underline),
// H3 = subsection (left-border indent), body text at readable size.
const lessonComponents: Components = {
  h1: ({ children }) => (
    <h1 className="!text-2xl !font-bold !mt-2 !mb-5 !pb-2 !border-b !border-border !tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="!text-xl !font-semibold !mt-10 !mb-3">
      {children}
    </h2>
  ),
  h3: ({ children }) => {
    const isQuestion = /question/i.test(String(children))
    if (isQuestion) {
      // children may be a plain string or an array of strings + React elements (math).
      // Only inspect/split the first string node — leave all other nodes untouched.
      const childArray = Array.isArray(children)
        ? (children as React.ReactNode[])
        : [children]
      const first = childArray[0]
      const colonIdx = typeof first === 'string' ? first.indexOf(':') : -1

      const boldPart = colonIdx !== -1 ? (first as string).slice(0, colonIdx + 1) : null
      const tail: React.ReactNode[] = colonIdx !== -1
        ? [(first as string).slice(colonIdx + 1), ...childArray.slice(1)]
        : childArray

      return (
        <h3 className="!mt-10 !mb-3 !ml-4">
          <span className="bg-muted text-foreground text-base font-medium px-5 py-2 inline-block">
            {boldPart && <strong className="font-semibold">{boldPart}</strong>}
            {tail}
          </span>
        </h3>
      )
    }
    return (
      <h3 className="!mt-10 !mb-3 !ml-4">
        <span className="bg-muted text-foreground text-lg font-semibold px-5 py-2 rounded-full">
          {children}
        </span>
      </h3>
    )
  },
  h4: ({ children }) => (
    <h4 className="!text-sm !font-semibold !mt-4 !mb-1 !pl-5 !text-muted-foreground uppercase tracking-wide">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="!mb-4 !leading-7 !text-[0.9375rem]">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="!pl-6 !mb-4 !space-y-1.5 !text-[0.9375rem] list-disc">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="!pl-6 !mb-4 !space-y-1.5 !text-[0.9375rem] list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="!leading-7 !pl-1">{children}</li>
  ),
  // Blockquotes used for key definitions, tips, or callout boxes
  blockquote: ({ children }) => (
    <blockquote className="!border-l-4 !border-primary/60 !pl-4 !py-1 !my-5 !bg-muted/40 !rounded-r-md !not-italic">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="!font-semibold">{children}</strong>
  ),
  hr: () => <hr className="!my-8 !border-border" />,
}

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

  // During streaming, render raw text to avoid constant ReactMarkdown
  // unmount/remount cycles that cause visible flickering. One clean render
  // happens when streaming completes and streaming flips to false.
  if (streaming) {
    const sanitized = content
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')

    return (
      <div className="pb-8">
        <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-[0.9375rem] leading-7">
          {sanitized}
        </div>
        <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle rounded-sm" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="pb-8">
        <MarkdownRenderer
          content={content}
          components={lessonComponents}
        />
      </div>
    </ScrollArea>
  )
}
