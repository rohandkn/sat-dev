'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownRendererProps {
  content: string
  className?: string
  components?: Components
  // Skip math plugins during streaming — incomplete LaTeX mid-stream causes
  // KaTeX parse errors and layout thrashing. Full render happens on completion.
  skipMath?: boolean
}

export function MarkdownRenderer({ content, className, components, skipMath }: MarkdownRendererProps) {
  const memoContent = useMemo(() => content, [content])
  const remarkPlugins = useMemo(() => skipMath ? [] : [remarkMath], [skipMath])
  const rehypePlugins = useMemo(() => skipMath ? [] : [rehypeKatex], [skipMath])

  return (
    <div className={`prose dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {memoContent}
      </ReactMarkdown>
    </div>
  )
}
