import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { RemediationChat } from '../remediation-chat'

describe('RemediationChat math rendering', () => {
  it('renders square roots in question text and messages', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(
        <RemediationChat
          questionText={'Solve the equation $\\sqrt{x + 3} = x - 1$.'}
          questionChoices={{
            A: '$2$',
            B: '$3$',
            C: '$4$',
            D: '$5$',
          }}
          userAnswer={null}
          isIdk={false}
          correctAnswer="A"
          messages={[
            { role: 'assistant', content: 'Start with $\\sqrt{x + 3} = x - 1$.' },
          ]}
          loading={false}
          streaming={false}
          isResolved={false}
          error={null}
          onSendMessage={() => {}}
        />
      )
    })

    expect(container.querySelectorAll('.katex').length).toBeGreaterThan(0)
    expect(container.querySelector('.katex-error')).toBeNull()
    expect(container.innerHTML).not.toContain('<annotation encoding="application/x-tex"><span class="katex">')

    root.unmount()
  })
})
