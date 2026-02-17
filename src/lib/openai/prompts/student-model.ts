interface StudentModelUpdateInput {
  topicName: string
  currentModel: {
    strengths: string[]
    weaknesses: string[]
    misconceptions: string[]
    mastery_level: number
  }
  examResults: Array<{
    question_text: string
    correct_answer: string
    user_answer: string | null
    is_correct: boolean | null
    is_idk: boolean
  }>
  remediationInsights?: string
}

export function buildStudentModelUpdatePrompt(input: StudentModelUpdateInput): string {
  const { topicName, currentModel, examResults, remediationInsights } = input

  const correct = examResults.filter(q => q.is_correct).length
  const total = examResults.length
  const score = total > 0 ? Math.round((correct / total) * 100) : 0

  return `You are an AI tutor analyzing a student's performance to update their learning profile.

TOPIC: ${topicName}

CURRENT STUDENT MODEL:
- Strengths: ${currentModel.strengths.join(', ') || 'None identified'}
- Weaknesses: ${currentModel.weaknesses.join(', ') || 'None identified'}
- Misconceptions: ${currentModel.misconceptions.join(', ') || 'None identified'}
- Current Mastery Level: ${currentModel.mastery_level}%

EXAM RESULTS (${correct}/${total} correct, ${score}%):
${examResults.map((q, i) => `${i + 1}. ${q.question_text}
   Correct: ${q.correct_answer} | Student: ${q.is_idk ? 'IDK' : q.user_answer} | ${q.is_correct ? 'CORRECT' : 'WRONG'}`).join('\n')}
${remediationInsights ? `\nREMEDIATION INSIGHTS:\n${remediationInsights}` : ''}

Based on this data, update the student model:
1. STRENGTHS: What concepts has the student demonstrated understanding of? (Keep existing valid strengths, add new ones)
2. WEAKNESSES: What areas need more work? (Update — remove resolved weaknesses, add new ones)
3. MISCONCEPTIONS: What specific misunderstandings does the student have? (Be precise — e.g., "Confuses slope with y-intercept" not just "doesn't understand lines")
4. MASTERY LEVEL: 0-100 score reflecting overall understanding of this topic

Be specific and actionable in your descriptions.`
}
