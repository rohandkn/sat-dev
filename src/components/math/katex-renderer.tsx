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
  // ── 0. Fix missing spaces between words and numbers / math variables ──

  // 0a: word (2+ letters) → digit
  let result = text.replace(/([a-z]{2,})(\d)/gi, '$1 $2')

  // 0b + 0c + 0d combined iterative loop (same logic as markdown-renderer)
  let prev = ''
  while (prev !== result) {
    prev = result
    // word → variable
    result = result.replace(
      /\b(of|or|and|for|is|if|in|at|by|on|as|when|from|with|into|that|this|then|find|what|have|each|value|since|where|are|but|can|how|not|was)([xyzXYZ])/g,
      '$1 $2'
    )
    // digit → word
    result = result.replace(
      /(\d)(into|and|or|back|from|with|that|this|then|when|where|since|are|but|if|in|at|by|on|as|is|for|so|to)/gi,
      '$1 $2'
    )
    // variable → word
    result = result.replace(
      /([xyzXYZ])(into|and|back|from|with|that|this|then|when|where|since)/g,
      '$1 $2'
    )
  }

  // ── 1. Display math — \[...\] and $$...$$ ──
  result = result
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => renderMath(m.trim(), true))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => renderMath(m.trim(), true))

  // ── 2. Inline math — \(...\) and $...$ ──
  result = result
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => renderMath(m.trim(), false))
    .replace(/\$([^\$\n]+?)\$/g, (_, m) => renderMath(m.trim(), false))

  // ── 3. Bare LaTeX remaining after step 2 (no delimiters at all) ──
  // Order matters: \left…\right first so inner \frac isn't rendered
  // separately (which would break the \left…\right match).

  // 3a: \left(…\right) pairs — BEFORE \frac
  result = result.replace(
    /(\\left[\(\[\{][\s\S]*?\\right[\)\]\}])/g,
    (_, inner) => renderMath(inner, false)
  )

  // 3b: \frac{…}{…}
  result = result.replace(
    /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match) => renderMath(match, false)
  )

  // 3c: \sqrt{…}
  result = result.replace(
    /\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match) => renderMath(match, false)
  )

  // 3d: Other common bare LaTeX operators
  result = result.replace(
    /(\\(?:cdot|times|div|pm|mp|leq|geq|neq|approx|infty|alpha|beta|pi|theta))(?!\w)/g,
    (_, cmd) => renderMath(cmd, false)
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
