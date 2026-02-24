'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KatexRenderer } from '@/components/math/katex-renderer'
import { cn } from '@/lib/utils'

interface QuestionCardProps {
  questionNumber: number
  totalQuestions: number
  questionText: string
  choices: Record<string, string>
  selectedAnswer: string | null
  isIdk: boolean
  onSelectAnswer: (answer: string) => void
  onIdk: () => void
  showResult?: boolean
  correctAnswer?: string
  explanation?: string
}

export function QuestionCard({
  questionNumber,
  totalQuestions,
  questionText,
  choices,
  selectedAnswer,
  isIdk,
  onSelectAnswer,
  onIdk,
  showResult,
  correctAnswer,
  explanation,
}: QuestionCardProps) {
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Question {questionNumber} of {totalQuestions}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-base leading-relaxed">
          <KatexRenderer content={questionText} />
        </div>

        <div className="space-y-3">
          {Object.entries(choices).map(([key, value]) => {
            const isSelected = selectedAnswer === key
            const isCorrectChoice = showResult && key === correctAnswer
            const isWrongChoice = showResult && isSelected && key !== correctAnswer

            return (
              <button
                type="button"
                key={key}
                onClick={() => !showResult && onSelectAnswer(key)}
                disabled={showResult}
                className={cn(
                  'w-full text-left p-4 rounded-lg border transition-all flex gap-3 items-start',
                  !showResult && isSelected && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                  !showResult && !isSelected && 'border-border hover:border-primary/50 hover:bg-accent',
                  isCorrectChoice && 'border-green-500 bg-green-50 dark:bg-green-950/20',
                  isWrongChoice && 'border-red-500 bg-red-50 dark:bg-red-950/20',
                  showResult && !isCorrectChoice && !isWrongChoice && 'opacity-50',
                )}
              >
                <span className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border',
                  isSelected && !showResult && 'bg-primary text-primary-foreground border-primary',
                  isCorrectChoice && 'bg-green-500 text-white border-green-500',
                  isWrongChoice && 'bg-red-500 text-white border-red-500',
                )}>
                  {key}
                </span>
                <span className="pt-1">
                  <KatexRenderer content={value} />
                </span>
              </button>
            )
          })}
        </div>

        {!showResult && (
          <Button
            variant={isIdk ? 'default' : 'outline'}
            className="w-full"
            onClick={onIdk}
          >
            {isIdk ? "Selected: I don't know" : "I don't know"}
          </Button>
        )}

        {showResult && isIdk && (
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            You selected &quot;I don&apos;t know&quot; for this question.
          </div>
        )}

        {showResult && explanation && (
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="font-medium text-sm">Explanation:</p>
            <div className="text-sm">
              <KatexRenderer content={explanation} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
