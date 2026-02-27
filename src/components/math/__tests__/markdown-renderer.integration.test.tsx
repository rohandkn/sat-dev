import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { MarkdownRenderer } from '../markdown-renderer'

describe('MarkdownRenderer integration', () => {
  it('renders remediation inline math in list items without KaTeX errors', () => {
    const content = `2. **Apply the quotient rule**:
   - $\\frac{x^5}{x^2} = x^{5-2} = x^3$
   - $\\frac{y^4}{y^2} = y^{4-2} = y^2$

3. **Combine the results**:
   $$3x^3y^2$$

1. **Apply the power of $3$ to each component**:
   - $2^3 = 8$
   - $(x^3)^3 = x^{3 \\cdot 3} = x^9$
   - $(y^2)^3 = y^{2 \\cdot 3} = y^6$`

    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(<MarkdownRenderer content={content} />)
    })

    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(7)
    expect(container.querySelector('.katex-error')).toBeNull()
    expect(container.innerHTML).not.toContain('$\\frac{y^4}{y^2}')
    expect(container.innerHTML).not.toContain('$(x^3)^3 = x^{3 \\cdot 3} = x^9$')

    root.unmount()
  })
})
