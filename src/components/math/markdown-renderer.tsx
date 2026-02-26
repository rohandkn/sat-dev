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
  // Normalize Unicode minus (−) to ASCII hyphen for consistent spacing fixes.
  result = result.replace(/\u2212/g, '-')
  // Recover bare inequality operators that lost their backslash or were
  // split by a stray newline (e.g. "x \nleq 3" or "x leq3").
  result = result.replace(/\n\s*(leq|geq)\b/gi, ' \\\\$1')
  result = result.replace(/(?<!\\)\b(leq|geq)\b/gi, '\\\\$1')
  result = result.replace(/\n(eq|eg|u|abla|ot|otin|i|leq|geq|mid)(?![a-zA-Z])/g, '\\n$1')
  result = result.replace(/\t(ext|extbf|extit|imes|heta|an|o\b|op|riangle|ilde)(?![a-zA-Z])/g, '\\t$1')
  result = result.replace(/\r(ight|angle|ceil|floor|ho)(?![a-zA-Z])/g, '\\r$1')
  result = result.replace(/\f(rac|orall)(?![a-zA-Z])/g, '\\f$1')
  result = result.replace(/\x08(oxed|inom|eta|ar|egin|mod)(?![a-zA-Z])/g, '\\b$1')

  // ── Step 0 ─────────────────────────────────────────────────────────
  // Structural fixes: brackets around display math and step splitting.
  //
  // NOTE: This step also balances stray $$ delimiters so the renderer
  // never shows raw $$ in the UI.

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

  // 0b4: Balance stray $$ delimiters on a per-line basis.
  //      If a line has an odd number of $$, add the missing opener/closer.
  //      This fixes cases like: "x - 4 > 7$$" or "$$x - 4 > 7".
  {
    let inDisplay = false
    result = result.split('\n').map(line => {
      const count = (line.match(/\$\$/g) || []).length
      const nonDelimiterContent = line.replace(/\$\$/g, '').trim()
      if (count % 2 === 1 && nonDelimiterContent.length > 0) {
        const trimmed = line.trim()
        if (trimmed.startsWith('$$') && !trimmed.endsWith('$$')) {
          line = `${line}$$`
        } else if (!trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
          line = `$$${line}`
        } else if (inDisplay) {
          line = `${line}$$`
        } else {
          line = `$$${line}$$`
        }
      }
      if (count % 2 === 1) inDisplay = !inDisplay
      return line
    }).join('\n')
  }

  // 0b5: Remove empty display math blocks that would render as raw $$.
  result = result.replace(/\$\$\s*\$\$/g, '')

  // 0b6: Normalize single-line display math into fenced blocks so
  //      remark-math always parses them as block math (especially in lists).
  result = result.split('\n').map(line => {
    const match = line.match(/^(\s*)\$\$([^$\n]+)\$\$\s*$/)
    if (!match) return line
    const indent = match[1]
    const inner = match[2].trim()
    return `${indent}$$\n${indent}${inner}\n${indent}$$`
  }).join('\n')

  // 0c: Split consecutive display math blocks onto separate lines.
  result = result.replace(/\$\$([^$]+)\$\$\s*\$\$/g, (_, c) => `$$${c}$$\n$$`)
  // 0c2: If two display blocks are adjacent, insert a blank line between them
  //      so list items render each step on its own line.
  {
    let p = ''
    while (p !== result) {
      p = result
      result = result.replace(
        /\$\$([\s\S]*?)\$\$\s*\$\$([\s\S]*?)\$\$/g,
        (_, a, b) => `$$${a}$$\n\n$$${b}$$`
      )
    }
  }
  // 0c3: Ensure display math blocks are isolated by blank lines so Markdown
  //      renders them as separate blocks (prevents line-collapsing).
  //      IMPORTANT: Do NOT insert blank lines INSIDE fenced display math
  //      (between $$ and its content), or remark-math won't parse it.
  {
    const lines = result.split('\n')
    const withSpacing: string[] = []
    let insideDisplayFence = false
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const isDelimiter = line.trim() === '$$'
      const hasDisplay = line.includes('$$')
      const indentMatch = line.match(/^\s*/)
      const indent = indentMatch ? indentMatch[0] : ''

      if (isDelimiter) {
        if (!insideDisplayFence) {
          // Opening $$: blank line before (separate from prose) but NOT after
          if (withSpacing.length > 0 && withSpacing[withSpacing.length - 1].trim() !== '') {
            withSpacing.push(indent)
          }
          withSpacing.push(line)
          insideDisplayFence = true
        } else {
          // Closing $$: NOT before (keep content attached), blank line after
          withSpacing.push(line)
          if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
            withSpacing.push(indent)
          }
          insideDisplayFence = false
        }
      } else if (hasDisplay) {
        // Single-line display math (e.g. $$expr$$ that 0b6 didn't expand)
        if (withSpacing.length > 0 && withSpacing[withSpacing.length - 1].trim() !== '') {
          withSpacing.push(indent)
        }
        withSpacing.push(line)
        if (i + 1 < lines.length && lines[i + 1].trim() !== '') {
          withSpacing.push(indent)
        }
      } else {
        withSpacing.push(line)
      }
    }
    result = withSpacing.join('\n')
  }

  // 0c4: If a list item line is immediately followed by display math,
  //      insert an indented blank line so Markdown treats the $$ block
  //      as a separate paragraph within the list item.
  {
    const lines = result.split('\n')
    const out: string[] = []
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      out.push(line)
      const next = lines[i + 1]
      if (!next) continue
      const isListItem = /^\s*(?:\d+\.)\s+/.test(line) || /^\s*[-*+]\s+/.test(line)
      const nextHasDisplay = next.includes('$$')
      const nextIsBlank = next.trim() === ''
      if (isListItem && nextHasDisplay && !nextIsBlank) {
        const indentMatch = next.match(/^\s*/)
        const indent = indentMatch ? indentMatch[0] : ''
        out.push(indent)
      }
    }
    result = out.join('\n')
  }

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
  // 1a4: negative number → word: "-2gives" → "-2 gives"
  result = result.replace(/(-\d+)([a-zA-Z])/g, '$1 $2')

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
      /(?<!\$)\$([^$\n]+)\$(?!\$)([\s\d+\-=*]+)(?<!\$)\$([^$\n]+)\$(?!\$)/g,
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
  // Ensure multiple-choice numeric answers are wrapped in $...$ when the
  // LLM omits delimiters (e.g., "A) -3, B) 0, C) 1, D) 2").
  result = replaceOutsideMath(
    result,
    /\b([A-E])\)\s*(-?\d+(?:\.\d+)?)(?=[,\s)]|$)/g,
    (_, label, value) => `${label}) $${value}$`
  )

  // ── Step 10b ───────────────────────────────────────────────────────
  // Ensure a space after multiple-choice labels when followed by a
  // non-space character: "C)40" → "C) 40", "C)$40$" → "C) $40$".
  result = replaceOutsideMath(
    result,
    /\b([A-E])\)(?=\S)/g,
    (_, label) => `${label}) `
  )

  // ── Step 10c ───────────────────────────────────────────────────────
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

  // ── Step 11 ────────────────────────────────────────────────────────
  // Final spacing cleanup outside math: fix "by-2gives" or "-2gives".
  result = replaceOutsideMath(
    result,
    /([a-zA-Z])-(\d+)([a-zA-Z])/g,
    (_, a, num, b) => `${a} -${num} ${b}`
  )
  result = replaceOutsideMath(
    result,
    /([a-zA-Z])-(\d+)/g,
    (_, a, num) => `${a} -${num}`
  )
  result = replaceOutsideMath(
    result,
    /(-\d+)([a-zA-Z])/g,
    (_, num, b) => `${num} ${b}`
  )

  // ── Step 12 ────────────────────────────────────────────────────────
  // Split consecutive inequality steps that are stuck together without
  // delimiters: "2y > 12 - 4xy > 6 - 2x" → two lines.
  result = replaceOutsideMath(
    result,
    /([=<>]|\\leq|\\geq|\\neq)\s*([\-]?\d+[a-zA-Z])/g,
    (match, op, next) => `${op} ${next.replace(/([a-zA-Z])/, '\n$1')}`
  )

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
