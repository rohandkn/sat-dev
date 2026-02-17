'use client'

import { useState, useCallback } from 'react'

export function useLesson() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  const generateLesson = useCallback(async (
    sessionId: string,
    lessonType: 'initial' | 'remediation' = 'initial'
  ) => {
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
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to generate lesson')
      }

      setLoading(false)
      setStreaming(true)

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        accumulated += text
        setContent(accumulated)
      }

      setStreaming(false)
      setComplete(true)
    } catch (err) {
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
