'use client'

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface KatexRendererProps {
  content: string
  className?: string
}

function renderLatex(text: string): string {
  // Replace display math $$...$$ first
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      })
    } catch {
      return `<span class="text-destructive">[Math Error]</span>`
    }
  })

  // Replace inline math $...$
  result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      })
    } catch {
      return `<span class="text-destructive">[Math Error]</span>`
    }
  })

  return result
}

export function KatexRenderer({ content, className }: KatexRendererProps) {
  const html = useMemo(() => renderLatex(content), [content])

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function KatexBlock({ content, className }: KatexRendererProps) {
  const html = useMemo(() => renderLatex(content), [content])

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
