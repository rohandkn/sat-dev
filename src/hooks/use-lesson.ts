'use client'

import { useState, useCallback, useRef } from 'react'

export function useLesson() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const generateLesson = useCallback(async (
    sessionId: string,
    lessonType: 'initial' | 'remediation' = 'initial'
  ) => {
    const requestId = ++requestIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setStreaming(false)
    setError(null)
    setContent('')
    setComplete(false)

    try {
      const res = await fetch('/api/lesson/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, lessonType }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate lesson')
      }

      if (requestId !== requestIdRef.current) return
      setLoading(false)
      setStreaming(true)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let accumulated = ''

      // Throttle React state updates to avoid rapid layout thrashing while streaming.
      // A lower update rate makes streaming stable and eliminates flicker.
      let pendingTimeout: ReturnType<typeof setTimeout> | null = null
      let pendingText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (requestId !== requestIdRef.current) return

        accumulated += decoder.decode(value, { stream: true })
        pendingText = accumulated

        if (pendingTimeout === null) {
          pendingTimeout = setTimeout(() => {
            setContent(pendingText)
            pendingTimeout = null
          }, 120)
        }
      }

      // Cancel any pending update and flush the final complete content.
      if (pendingTimeout !== null) clearTimeout(pendingTimeout)
      if (requestId !== requestIdRef.current) return
      setContent(accumulated)

      setStreaming(false)
      setComplete(true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to generate lesson')
      setLoading(false)
      setStreaming(false)
    }
  }, [])

  return {
    content,
    loading,
    streaming,
    error,
    complete,
    generateLesson,
  }
}
