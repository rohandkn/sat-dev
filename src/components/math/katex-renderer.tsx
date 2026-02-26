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

// Preprocess text before KaTeX rendering to fix structural issues.
function preprocessKatex(text: string): string {
  let result = text

  // Convert literal "\n" sequences to real newlines, but avoid LaTeX commands
  // like "\neq" that also start with "\n".
  result = result.replace(/\\n(?!eq\b|eg\b|u\b|abla|ot\b|otin|i\b|leq|geq|mid)/g, '\n')

  // Normalize Unicode minus (−) to ASCII hyphen for consistent spacing fixes.
  result = result.replace(/\u2212/g, '-')

  // Recover bare inequality operators that lost their backslash or were
  // split by a stray newline (e.g. "x \nleq 3" or "x leq3").
  result = result.replace(/\n\s*(leq|geq)\b/gi, ' \\\\$1')
  result = result.replace(/(?<!\\)\b(leq|geq)\b/gi, '\\\\$1')

  // Strip redundant \($...$\) → $...$  (LLM mixing delimiter styles)
  result = result.replace(/\\\(\s*\$([^$\n]+?)\$\s*\\\)/g, (_, inner) => `$${inner}$`)

  // Convert \(...\) inline math to $...$ for consistent processing
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`)

  // Strip outer [ ] brackets from display-math-style expressions.
  // GPT sometimes writes "[ 6x = 12 ]" or "$[ 6x = 12 ]$" instead of proper
  // display math. Remove the brackets so only the equation shows.
  // Handles both: bare "[ expr ]" and inside delimiters "$[ expr ]$"
  result = result.replace(/\$\[\s*([\s\S]*?)\s*\]\$/g, (_, inner) => `$${inner.trim()}$`)
  result = result.replace(/\$\$\[\s*([\s\S]*?)\s*\]\$\$/g, (_, inner) => `$$${inner.trim()}$$`)
  result = result.replace(/\\\[\[\s*([\s\S]*?)\s*\]\\\]/g, (_, inner) => `\\[${inner.trim()}\\]`)

  // Split consecutive display-math or bracketed-equation blocks onto separate
  // lines so each step renders on its own line.
  // "[expr1] [expr2]" → "[expr1]\n[expr2]"
  // "\[expr1\] \[expr2\]" → "\[expr1\]\n\[expr2\]"
  // "$$expr1$$ $$expr2$$" → "$$expr1$$\n$$expr2$$"
  result = result.replace(/\\\]\s*\\\[/g, '\\]\n\\[')
  result = result.replace(/\$\$([^$]+)\$\$\s*\$\$/g, '$$$1$$\n$$')

  // Split consecutive inline $..$ blocks that look like equation/inequality
  // steps onto separate lines. Matches expressions containing =, <, >,
  // \leq, \geq, \neq, or similar comparison operators.
  const hasComparison = (s: string) => /[=<>]|\\leq|\\geq|\\neq|\\le\b|\\ge\b/.test(s)
  // Use [ \t]+ (horizontal whitespace only) so already-split pairs
  // separated by \n don't re-match and stall the loop.
  let prev = ''
  while (prev !== result) {
    prev = result
    result = result.replace(
      /\$([^$\n]+)\$[ \t]+\$([^$\n]+)\$/g,
      (match, a, b) => hasComparison(a) && hasComparison(b) ? `$${a}$\n$${b}$` : match
    )
  }

  return result
}

function renderLatex(text: string): string {
  // ── Pre-processing: structural fixes ──
  let result = preprocessKatex(text)

  // ── 0. Recover LaTeX commands corrupted by JSON \n interpretation ──
  // \neq → newline + "eq", \frac → form-feed + "rac", etc.
  result = result.replace(/\n(eq|eg|u|abla|ot|otin|i|leq|geq|mid)(?![a-zA-Z])/g, '\\n$1')
  result = result.replace(/\t(ext|extbf|extit|imes|heta|an|o\b|op|riangle|ilde)(?![a-zA-Z])/g, '\\t$1')
  result = result.replace(/\r(ight|angle|ceil|floor|ho)(?![a-zA-Z])/g, '\\r$1')
  result = result.replace(/\f(rac|orall)(?![a-zA-Z])/g, '\\f$1')
  result = result.replace(/\x08(oxed|inom|eta|ar|egin|mod)(?![a-zA-Z])/g, '\\b$1')

  // ── 0a. Fix missing spaces between words and numbers / math variables ──

  // 0a1: word (2+ letters) → digit
  result = result.replace(/([a-z]{2,})(\d)/gi, '$1 $2')

  // 0a2: colon directly followed by a letter, digit, $ or \ — add space.
  result = result.replace(/:([a-zA-Z0-9$\\])/g, ': $1')

  // 0a3: word → negative number: "by-2" → "by -2"
  result = result.replace(/([a-zA-Z])(-)(\d)/g, '$1 $2$3')
  // 0a4: negative number → word: "-2gives" → "-2 gives"
  result = result.replace(/(-\d+)([a-zA-Z])/g, '$1 $2')

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
      /(\d)(into|and|or|back|from|with|that|this|then|when|where|since|are|but|if|in|at|by|on|as|is|for|so|to|gives|both|sides|dividing|multiplying|subtracting|adding|becomes|means|get|gets|yields|result)/gi,
      '$1 $2'
    )
    // variable → word
    result = result.replace(
      /([xyzXYZ])(into|and|back|from|with|that|this|then|when|where|since|gives|both|sides|dividing|multiplying|becomes|means)/g,
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

  // 3d: Compound \not commands (\not\leq, \not\geq, etc.)
  result = result.replace(
    /(\\not\s*\\(?:leq|geq|neq|le|ge|in))(?!\w)/g,
    (_, cmd) => renderMath(cmd, false)
  )

  // 3e: Other common bare LaTeX operators
  result = result.replace(
    /(\\(?:cdot|times|div|pm|mp|leq|geq|neq|approx|infty|alpha|beta|pi|theta|not))(?!\w)/g,
    (_, cmd) => renderMath(cmd, false)
  )

  // 4. Convert remaining newlines to <br> so step-split equations render
  //    on separate lines in the HTML output.
  result = result.replace(/\n/g, '<br>')

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
