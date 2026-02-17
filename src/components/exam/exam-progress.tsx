'use client'

import { Progress } from '@/components/ui/progress'

interface ExamProgressProps {
  currentQuestion: number
  totalQuestions: number
}

export function ExamProgress({ currentQuestion, totalQuestions }: ExamProgressProps) {
  const progress = ((currentQuestion) / totalQuestions) * 100

  return (
    <div className="w-full max-w-2xl mx-auto space-y-2">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Question {currentQuestion} of {totalQuestions}</span>
        <span>{Math.round(progress)}% complete</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  )
}
