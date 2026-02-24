'use client'

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface KatexRendererProps {
  content: string
  className?: string
}

function renderMath(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, { displayMode, throwOnError: false })
  } catch {
    return `<span class="text-destructive">[Math Error]</span>`
  }
}

function renderLatex(text: string): string {
  // 1. Display math — \[...\] and $$...$$
  let result = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => renderMath(m.trim(), true))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => renderMath(m.trim(), true))

  // 2. Inline math — \(...\) and $...$
  result = result
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => renderMath(m.trim(), false))
    .replace(/\$([^\$\n]+?)\$/g, (_, m) => renderMath(m.trim(), false))

  // 3. Bare LaTeX fractions without any delimiter (e.g. GPT omitting $ around choices).
  //    Handles one level of inner braces: \frac{x+1}{2} or \frac{2}{3}.
  result = result.replace(
    /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match) => renderMath(match, false)
  )

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
