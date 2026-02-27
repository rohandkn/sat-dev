import { describe, expect, it } from 'vitest'
import { renderLatex } from '../katex-renderer'

describe('katex renderer', () => {
  it('renders bare indexed square roots', () => {
    const html = renderLatex('Simplify \\sqrt[3]{27}.')

    expect(html).toContain('katex')
    expect(html).toContain('\\sqrt[3]{27}')
    expect(html).not.toContain('[Math Error]')
  })

  it('renders inline square roots in exam-style question text', () => {
    const html = renderLatex('Solve the equation $\\sqrt{x + 3} = x - 1$.')

    expect(html).toContain('katex')
    expect(html).toContain('\\sqrt{x + 3}')
    expect(html).toContain(' = x - 1')
    expect(html).not.toContain('<annotation encoding="application/x-tex"><span class="katex">')
    expect(html).not.toContain('[Math Error]')
  })
})
