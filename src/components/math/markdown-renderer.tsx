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

// Preprocess LLM-generated markdown to fix common LaTeX formatting issues.
//
// The LLM frequently produces malformed math markup.  This function applies
// a chain of deterministic fixes *before* remark-math + rehype-katex parse
// the text, so that every LaTeX expression is correctly delimited and every
// boundary between prose and math has proper whitespace.
//
// Step overview (numbers match the code comments below):
//   1  Fix missing spaces between words ↔ numbers / variables
//   2  Ensure whitespace around $ delimiters (both sides)
//   3  Wrap bare LaTeX commands (\frac, \left…\right, \sqrt, etc.) in $…$
//   4  Merge fragmented \left(…\right) expressions split by extra $
//   5  Remove leading / trailing spaces inside $…$ (remark-math rejects them)
//   6  Merge adjacent $…$ blocks connected only by operators / digits
//   7  Close unclosed $\command at end-of-line
//   8  Liberate prose words trapped between $ delimiters ($word$ → word)
//   9  Balance stray $ on lines with an odd count
// Run a regex replacement only on text that is NOT inside $…$ or $$…$$ pairs.
function replaceOutsideMath(
  text: string,
  pattern: RegExp,
  replacement: (substring: string, ...args: string[]) => string,
): string {
  const segments: string[] = []
  const mathPattern = /\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = mathPattern.exec(text)) !== null) {
    segments.push(text.slice(lastIdx, m.index).replace(pattern, replacement))
    segments.push(m[0])
    lastIdx = m.index + m[0].length
  }
  segments.push(text.slice(lastIdx).replace(pattern, replacement))
  return segments.join('')
}

function preprocessMarkdownMath(text: string): string {
  // ── Step -1 ────────────────────────────────────────────────────────
  // Recover LaTeX commands corrupted by JSON \n interpretation.
  // \neq → newline + "eq", \frac → form-feed + "rac", etc.
  let result = text
  result = result.replace(/\n(eq|eg|u|abla|ot|otin|i|leq|geq|mid)(?![a-zA-Z])/g, '\\n$1')
  result = result.replace(/\t(ext|extbf|extit|imes|heta|an|o\b|op|riangle|ilde)(?![a-zA-Z])/g, '\\t$1')
  result = result.replace(/\r(ight|angle|ceil|floor|ho)(?![a-zA-Z])/g, '\\r$1')
  result = result.replace(/\f(rac|orall)(?![a-zA-Z])/g, '\\f$1')
  result = result.replace(/\x08(oxed|inom|eta|ar|egin|mod)(?![a-zA-Z])/g, '\\b$1')

  // ── Step 0 ─────────────────────────────────────────────────────────
  // Structural fixes: brackets around display math and step splitting.

  // 0a: Strip outer [ ] brackets from display math.
  //     GPT writes "$$[ expr ]$$" or "\[[ expr ]\]" — remove the inner brackets.
  result = result.replace(/\$\$\[\s*([\s\S]*?)\s*\]\$\$/g, (_, inner) => `$$${inner.trim()}$$`)
  result = result.replace(/\\\[\[\s*([\s\S]*?)\s*\]\\\]/g, (_, inner) => `\\[${inner.trim()}\\]`)

  // 0b: Convert \[...\] display math to $$...$$ for more reliable remark-math
  //     parsing (avoids CommonMark treating \[ as an escaped bracket).
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)

  // 0b2: Strip redundant \($...$\) → $...$  (LLM mixing delimiter styles)
  result = result.replace(/\\\(\s*\$([^$\n]+?)\$\s*\\\)/g, (_, inner) => `$${inner}$`)

  // 0b3: Convert \(...\) inline math to $...$ for reliable remark-math parsing
  //      (same reason as 0b: CommonMark treats \( as an escaped parenthesis).
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`)

  // 0c: Split consecutive display math blocks onto separate lines.
  result = result.replace(/\$\$([^$]+)\$\$\s*\$\$/g, '$$$1$$\n$$')

  // 0d: Split consecutive inline $..$ blocks that both contain comparison
  //     operators (=, <, >, \leq, \geq, \neq) onto separate lines so each
  //     algebraic step appears on its own line.
  const hasComparison = (s: string) => /[=<>]|\\leq|\\geq|\\neq|\\le\b|\\ge\b/.test(s)
  {
    let p = ''
    while (p !== result) {
      p = result
      // Use [ \t]+ (horizontal whitespace only) so already-split pairs
      // separated by \n don't re-match and stall the loop.
      result = result.replace(
        /\$([^$\n]+)\$[ \t]+\$([^$\n]+)\$/g,
        (match, a, b) => hasComparison(a) && hasComparison(b) ? `$${a}$\n$${b}$` : match
      )
    }
  }

  // ── Step 1 ─────────────────────────────────────────────────────────
  // Fix missing spaces between words and numbers / math variables.
  // All sub-steps run in one iterative loop so cascading fixes like
  // "ofywhenx" → "of ywhenx" → "of y whenx" → "of y when x" resolve.

  // 1a: word (2+ letters) → digit:  "and2x" → "and 2x"
  result = result.replace(/([a-z]{2,})(\d)/gi, '$1 $2')

  // 1a2: colon directly followed by a letter, digit, $ or \ — add space.
  //      Fixes "find x:x = 2" → "find x: x = 2"
  result = result.replace(/:([a-zA-Z0-9$\\])/g, ': $1')

  // 1a3: word → negative number: "by-2" → "by -2"
  result = result.replace(/([a-zA-Z])(-)(\d)/g, '$1 $2$3')

  // 1b + 1c + 1d combined iterative loop:
  //   1b: common-word → math variable   ("ofy" → "of y")
  //   1c: digit → common-word            ("3into" → "3 into")
  //   1d: math-variable → common-word    ("ywhen" → "y when")
  // No trailing \b — "3intox" has no word boundary between "into" and "x",
  // but we still need to split.  Iteration handles the cascade.
  let prev = ''
  while (prev !== result) {
    prev = result
    // 1b: word → variable
    result = result.replace(
      /\b(of|or|and|for|is|if|in|at|by|on|as|when|from|with|into|that|this|then|find|what|have|each|value|since|where|are|but|can|how|not|was)([xyzXYZ])/g,
      '$1 $2'
    )
    // 1c: digit → word
    result = result.replace(
      /(\d)(into|and|or|back|from|with|that|this|then|when|where|since|are|but|if|in|at|by|on|as|is|for|so|to|gives|both|sides|dividing|multiplying|subtracting|adding|becomes|means|get|gets|yields|result)/gi,
      '$1 $2'
    )
    // 1d: variable → word
    result = result.replace(
      /([xyzXYZ])(into|and|back|from|with|that|this|then|when|where|since|gives|both|sides|dividing|multiplying|becomes|means)/g,
      '$1 $2'
    )
  }

  // ── Step 2 ─────────────────────────────────────────────────────────
  // Add space before $ when immediately preceded by a letter.
  result = result.replace(/([a-zA-Z])\$/g, (_, char) => `${char} $`)

  // ── Step 3 ─────────────────────────────────────────────────────────
  // Wrap bare LaTeX commands that are NOT already inside $…$.
  // replaceOutsideMath splits on existing $…$ pairs so we never inject
  // extra $ delimiters inside an already-delimited expression.
  // Order matters: wrap \left…\right FIRST so inner \frac isn't wrapped
  // separately (which would inject $ inside the \left…\right span).

  // 3a: \left(…\right) pairs — must come before \frac wrapping
  result = replaceOutsideMath(
    result,
    /(\\left[\(\[\{][\s\S]*?\\right[\)\]\}])/g,
    (_, inner) => `$${inner}$`
  )

  // 3b: \frac{…}{…}
  result = replaceOutsideMath(
    result,
    /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match) => `$${match}$`
  )

  // 3c: \sqrt{…}
  result = replaceOutsideMath(
    result,
    /\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match) => `$${match}$`
  )

  // 3d: Bare inequality expressions: "5x \leq 15" → "$5x \leq 15$"
  //     Must come BEFORE 3e (bare operators) so the full expression is wrapped.
  result = replaceOutsideMath(
    result,
    /([a-zA-Z0-9][a-zA-Z0-9\s+\-*/^{}(),.]*?)\s*(\\(?:not\\)?(?:leq|geq|neq|le|ge))\s*([a-zA-Z0-9\-+][a-zA-Z0-9\s+\-*/^{}(),.]*[a-zA-Z0-9)}\]])/g,
    (match) => `$${match.trim()}$`
  )

  // 3d2: Compound \not commands (\not\leq, \not\geq, etc.)
  result = replaceOutsideMath(
    result,
    /(\\not\s*\\(?:leq|geq|neq|le|ge|in))(?!\w)/g,
    (_, cmd) => `$${cmd}$`
  )

  // 3e: Other common bare LaTeX operators
  result = replaceOutsideMath(
    result,
    /(\\(?:cdot|times|div|pm|mp|leq|geq|neq|approx|infty|alpha|beta|pi|theta|not))(?!\w)/g,
    (_, cmd) => `$${cmd}$`
  )

  // ── Step 4 ─────────────────────────────────────────────────────────
  // Merge $A\left(OPENER$ text $\right)CLOSER…$ into one $…$.
  prev = ''
  while (prev !== result) {
    prev = result
    result = result.replace(
      /\$([^$\n]*\\left[\(\[\{|])\$([^$\n]*?)\$(\\right[\)\]\}|][^$\n]*)\$/g,
      (_, a, between, c) => `$${a}${between}${c}$`
    )
  }

  // ── Step 5 ─────────────────────────────────────────────────────────
  // Fix leading / trailing spaces inside $…$ pairs.
  result = result.replace(
    /\$ +([^\s$][^$\n]*?)\$/g,
    (_, inner) => `$${inner}$`
  )
  result = result.replace(
    /\$([^\n$][^$\n]*?) +\$/g,
    (_, inner) => `$${inner.trimEnd()}$`
  )

  // ── Step 6 ─────────────────────────────────────────────────────────
  // Merge adjacent $…$ blocks separated only by math operators / digits.
  // Require at least one separator character to avoid merging unrelated
  // adjacent expressions like "$a$" "$b$".
  prev = ''
  while (prev !== result) {
    prev = result
    result = result.replace(
      /\$([^$\n]+)\$([\s\d+\-=*]+)\$([^$\n]+)\$/g,
      (match, a, between, b) => {
        if (/^[\s\d+\-=*]+$/.test(between)) {
          return `$${a}${between}${b}$`
        }
        return match
      }
    )
  }

  // ── Step 7 ─────────────────────────────────────────────────────────
  // Fix unclosed $\command at end of line (no matching closing $).
  result = result.replace(
    /\$(\\[a-zA-Z]+[^$\n]*)$/gm,
    (_, content) => `$${content}$`
  )

  // ── Step 8 ─────────────────────────────────────────────────────────
  // Liberate prose words trapped between $ delimiters.
  prev = ''
  while (prev !== result) {
    prev = result
    result = result.replace(
      /\$([a-zA-Z]{3,})\$/g,
      (_, word) => `$ ${word} $`
    )
  }
  // Re-run step 5 to clean up spaces introduced by step 8.
  result = result.replace(
    /\$ +([^\s$][^$\n]*?)\$/g,
    (_, inner) => `$${inner}$`
  )
  result = result.replace(
    /\$([^\n$][^$\n]*?) +\$/g,
    (_, inner) => `$${inner.trimEnd()}$`
  )

  // ── Step 9 ─────────────────────────────────────────────────────────
  // Ensure whitespace around every $…$ pair so math never visually
  // glues to adjacent prose.  Uses a simple left-to-right state machine
  // to identify valid pairs, then inserts spaces at boundaries.
  result = result.split('\n').map(line => {
    // Find valid $…$ pair boundaries (content must not start/end with space)
    const pairs: { start: number; end: number }[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '$') {
        // Skip $$ display math
        if (i + 1 < line.length && line[i + 1] === '$') {
          const close = line.indexOf('$$', i + 2)
          if (close !== -1) {
            pairs.push({ start: i, end: close + 1 })
            i = close + 2
            continue
          }
        }
        // Find closing $
        const j = line.indexOf('$', i + 1)
        if (j !== -1) {
          const content = line.slice(i + 1, j)
          if (content.length > 0 && !/^\s/.test(content) && !/\s$/.test(content)) {
            pairs.push({ start: i, end: j })
            i = j + 1
            continue
          }
        }
      }
      i++
    }

    if (pairs.length === 0) return line

    // Rebuild the line, inserting spaces around each pair boundary
    let out = ''
    let lastEnd = 0
    for (const p of pairs) {
      out += line.slice(lastEnd, p.start)
      // Space before pair if preceded by alphanumeric
      if (out.length > 0 && /[a-zA-Z0-9\}\)\]]$/.test(out)) {
        out += ' '
      }
      out += line.slice(p.start, p.end + 1)
      // Space after pair if followed by a letter
      if (p.end + 1 < line.length && /[a-zA-Z]/.test(line[p.end + 1])) {
        out += ' '
      }
      lastEnd = p.end + 1
    }
    out += line.slice(lastEnd)
    return out
  }).join('\n')

  // ── Step 10 ────────────────────────────────────────────────────────
  // Safety net: on any line with an odd number of $ (unbalanced),
  // close an unclosed expression or remove a stray $.
  result = result.split('\n').map(line => {
    const dollarCount = (line.match(/\$/g) || []).length
    if (dollarCount % 2 === 1) {
      const lastDollar = line.lastIndexOf('$')
      const afterLast = line.slice(lastDollar + 1)
      if (afterLast.trim().length > 0 && /[a-zA-Z0-9\\]/.test(afterLast)) {
        return line + '$'
      }
      const beforeLast = line.slice(0, lastDollar)
      if (afterLast.trim().length === 0 && beforeLast.length > 0) {
        return beforeLast + afterLast
      }
    }
    return line
  }).join('\n')

  return result
}

export function MarkdownRenderer({ content, className, components, skipMath }: MarkdownRendererProps) {
  const processedContent = useMemo(() => skipMath ? content : preprocessMarkdownMath(content), [content, skipMath])
  const remarkPlugins = useMemo(() => skipMath ? [] : [remarkMath], [skipMath])
  const rehypePlugins = useMemo(() => skipMath ? [] : [rehypeKatex], [skipMath])

  return (
    <div className={`prose dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
