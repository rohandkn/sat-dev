'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KatexRenderer } from '@/components/math/katex-renderer'
import { PASS_THRESHOLD } from '@/lib/learning-loop/scoring'

interface ExamResult {
  questionId: string
  isCorrect: boolean
  isIdk: boolean
  correctAnswer: string
  explanation: string
}

interface QuestionData {
  id: string
  question_text: string
  choices: Record<string, string>
  correct_answer: string
  user_answer: string | null
  is_idk: boolean
  explanation: string
}

interface ExamResultsProps {
  score: number
  results: ExamResult[]
  questions: QuestionData[]
  examType: 'pre' | 'post' | 'remediation'
  onContinue: () => void
  continueLabel?: string
}

export function ExamResults({
  score,
  results,
  questions,
  examType,
  onContinue,
  continueLabel,
}: ExamResultsProps) {
  const passed = score >= PASS_THRESHOLD
  const correct = results.filter(r => r.isCorrect).length

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {examType === 'pre' ? 'Pre-Exam' : examType === 'post' ? 'Post-Exam' : 'Remediation Exam'} Results
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="text-5xl font-bold">
            {score}%
          </div>
          <p className="text-muted-foreground">
            {correct} out of {results.length} correct
          </p>
          {examType !== 'pre' && (
            <Badge variant={passed ? 'default' : 'secondary'} className={passed ? 'bg-green-600' : ''}>
              {passed ? 'Passed' : 'Needs Review'}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Question Review</h3>
        {questions.map((q, i) => {
          const result = results.find(r => r.questionId === q.id)
          return (
            <Card key={q.id} className={result?.isCorrect ? 'border-green-200' : 'border-red-200'}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">Q{i + 1}.</span>
                  <Badge variant={result?.isCorrect ? 'default' : 'destructive'} className="flex-shrink-0">
                    {result?.isCorrect ? 'Correct' : result?.isIdk ? 'IDK' : 'Wrong'}
                  </Badge>
                </div>
                <div className="text-sm">
                  <KatexRenderer content={q.question_text} />
                </div>
                {!result?.isCorrect && (
                  <div className="text-sm text-muted-foreground">
                    {q.user_answer && !q.is_idk && (
                      <p>Your answer: <strong>{q.user_answer}</strong></p>
                    )}
                    <p>Correct answer: <strong>{q.correct_answer}</strong></p>
                  </div>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show explanation
                  </summary>
                  <div className="mt-2 bg-muted p-3 rounded-md">
                    <KatexRenderer content={q.explanation} />
                  </div>
                </details>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button onClick={onContinue} className="w-full" size="lg">
        {continueLabel ?? 'Continue'}
      </Button>
    </div>
  )
}
