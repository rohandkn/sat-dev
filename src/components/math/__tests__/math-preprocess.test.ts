import { describe, expect, it } from 'vitest'
import { preprocessMarkdownMath } from '../markdown-renderer'

describe('math preprocess', () => {
  it('normalizes double-escaped latex commands inside inline math', () => {
    const input = [
      '- $\\\\frac{y^4}{y^2} = y^{4-2} = y^2$',
      '- $(x^3)^3 = x^{3 \\\\cdot 3} = x^9$',
    ].join('\n')

    const output = preprocessMarkdownMath(input)

    expect(output).toContain('$\\frac{y^4}{y^2} = y^{4-2} = y^2$')
    expect(output).toContain('$(x^3)^3 = x^{3 \\cdot 3} = x^9$')
    expect(output).not.toContain('\\\\frac')
    expect(output).not.toContain('\\\\cdot')
  })
})
