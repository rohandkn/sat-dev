'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KatexBlock } from '@/components/math/katex-renderer'
import { Skeleton } from '@/components/ui/skeleton'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

interface RemediationChatProps {
  questionText: string
  questionChoices: Record<string, string>
  userAnswer: string | null
  isIdk: boolean
  correctAnswer: string
  messages: Message[]
  loading: boolean
  streaming: boolean
  isResolved: boolean
  error: string | null
  onSendMessage: (message: string) => void
}

export function RemediationChat({
  questionText,
  questionChoices,
  userAnswer,
  isIdk,
  correctAnswer,
  messages,
  loading,
  streaming,
  isResolved,
  error,
  onSendMessage,
}: RemediationChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading || streaming || isResolved) return
    onSendMessage(input.trim())
    setInput('')
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Remediation Chat</CardTitle>
          {isResolved && <Badge variant="default" className="bg-green-600">Resolved</Badge>}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show question
          </summary>
          <div className="mt-2 p-3 bg-muted rounded-md space-y-2">
            <KatexBlock content={questionText} />
            <div className="text-xs space-y-1">
              {Object.entries(questionChoices).map(([k, v]) => (
                <div key={k} className={k === correctAnswer ? 'font-medium text-green-600' : ''}>
                  {k}) <KatexBlock content={v} className="inline" />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Your answer: {isIdk ? "I don't know" : userAnswer}
            </p>
          </div>
        </details>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 pr-2" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <KatexBlock content={msg.content} />
                </div>
              </div>
            ))}

            {(loading || streaming) && messages.length === 0 && (
              <Skeleton className="h-20 w-3/4" />
            )}

            {loading && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-foreground/30 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}

            {/* Hardcoded success message when the student reaches the correct answer.
                Replaces the LLM's final message so the student sees a clear, consistent confirmation. */}
            {isResolved && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm bg-muted font-medium">
                  Awesome, you got the correct answer: <strong>{correctAnswer}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="text-destructive text-sm py-2">{error}</p>
        )}

        {isResolved ? (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-center">
            Great job! You&apos;ve demonstrated understanding of this concept.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your answer or question..."
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <Button type="submit" disabled={!input.trim() || loading || streaming} className="self-end">
              Send
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
