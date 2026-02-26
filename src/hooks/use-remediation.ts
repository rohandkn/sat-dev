'use client'

import { useState, useCallback } from 'react'

// Strip any role prefix the LLM might include despite being told not to
function stripRolePrefix(text: string): string {
  return text.replace(/^(Tutor|Assistant|AI|Mentor|Helper):\s*/i, '').trim()
}

interface Message {
  role: 'assistant' | 'user'
  content: string
}

export function useRemediation() {
  const [messages, setMessages] = useState<Message[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [isResolved, setIsResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startThread = useCallback(async (questionId: string, sessionId: string) => {
    setLoading(true)
    setError(null)
    setMessages([])
    setIsResolved(false)

    try {
      const res = await fetch('/api/remediation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, sessionId }),
      })

      if (!res.ok) {
        const data = await res.json()
        // If thread already exists, load it
        if (data.thread) {
          setThreadId(data.thread.id)
          setMessages(data.messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'assistant' | 'user',
            content: m.content,
          })))
          setIsResolved(data.thread.is_resolved)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to start remediation')
      }

      const newThreadId = res.headers.get('X-Thread-Id')

      if (newThreadId) {
        // New thread — response is a text stream
        setThreadId(newThreadId)
        setLoading(false)
        setStreaming(true)

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let accumulated = ''
        let pendingRafId: number | null = null
        let pendingText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          accumulated += decoder.decode(value, { stream: true })
          pendingText = accumulated

          if (pendingRafId === null) {
            pendingRafId = requestAnimationFrame(() => {
              setMessages([{ role: 'assistant', content: stripRolePrefix(pendingText) }])
              pendingRafId = null
            })
          }
        }

        if (pendingRafId !== null) cancelAnimationFrame(pendingRafId)
        setMessages([{ role: 'assistant', content: stripRolePrefix(accumulated) }])
        setStreaming(false)
      } else {
        // Existing thread — response is JSON with thread + messages
        const data = await res.json()
        setThreadId(data.thread.id)
        setMessages((data.messages ?? []).map((m: { role: string; content: string }) => ({
          role: m.role as 'assistant' | 'user',
          content: m.content,
        })))
        setIsResolved(data.thread.is_resolved)
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start remediation')
      setLoading(false)
      setStreaming(false)
    }
  }, [])

  const sendMessage = useCallback(async (message: string) => {
    if (!threadId || isResolved) return

    // Add user message optimistically
    setMessages(prev => [...prev, { role: 'user', content: message }])
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/remediation/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send message')
      }

      const data = await res.json()

      if (data.isResolved) {
        // Don't add the LLM's final response — RemediationChat will render a
        // hardcoded "Awesome, you now know how to derive the correct answer: [answer]" message instead.
        setIsResolved(true)
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: stripRolePrefix(data.message) }])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }, [threadId, isResolved])

  const reset = useCallback(() => {
    setMessages([])
    setThreadId(null)
    setIsResolved(false)
    setError(null)
  }, [])

  return {
    messages,
    threadId,
    loading,
    streaming,
    isResolved,
    error,
    startThread,
    sendMessage,
    reset,
  }
}
