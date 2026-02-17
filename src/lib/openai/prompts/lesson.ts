interface LessonPromptInput {
  topicName: string
  topicDescription: string
  lessonType: 'initial' | 'remediation'
  sessionNumber: number
  studentModel?: {
    strengths: string[]
    weaknesses: string[]
    misconceptions: string[]
    mastery_level: number
  }
  wrongQuestions: Array<{
    question_text: string
    choices: Record<string, string>
    correct_answer: string
    user_answer: string | null
    is_idk: boolean
    explanation: string
  }>
  remediationInsights?: string
}

export function buildLessonPrompt(input: LessonPromptInput): string {
  const {
    topicName,
    topicDescription,
    lessonType,
    sessionNumber,
    studentModel,
    wrongQuestions,
    remediationInsights,
  } = input

  let studentContext = ''
  if (studentModel && (studentModel.strengths.length > 0 || studentModel.weaknesses.length > 0)) {
    studentContext = `
STUDENT PROFILE:
- Strengths: ${studentModel.strengths.join(', ') || 'None identified yet'}
- Weaknesses: ${studentModel.weaknesses.join(', ') || 'None identified yet'}
- Misconceptions: ${studentModel.misconceptions.join(', ') || 'None identified yet'}
- Mastery Level: ${studentModel.mastery_level}%`
  }

  const wrongQuestionsSection = wrongQuestions.length > 0
    ? `
QUESTIONS THE STUDENT GOT WRONG (you MUST address each one):
${wrongQuestions.map((q, i) => `
Question ${i + 1}: ${q.question_text}
Choices: ${Object.entries(q.choices).map(([k, v]) => `${k}) ${v}`).join(', ')}
Correct Answer: ${q.correct_answer}
Student's Answer: ${q.is_idk ? 'Said "I don\'t know"' : q.user_answer}
Explanation: ${q.explanation}
`).join('\n')}`
    : ''

  const isRemediation = lessonType === 'remediation'

  let teachingApproach = ''
  if (isRemediation && sessionNumber > 1) {
    teachingApproach = `
IMPORTANT: This is attempt #${sessionNumber} at remediation. The student has already seen a lesson on these concepts but still struggled. Use a DIFFERENT teaching approach:
- Try different analogies and examples
- Break concepts down into smaller steps
- Use more visual/concrete explanations
- Start from an even more fundamental level`
  }

  return `You are an expert SAT Math tutor creating a ${isRemediation ? 'remediation' : 'personalized'} lesson.

TOPIC: ${topicName}
DESCRIPTION: ${topicDescription}
${studentContext}
${teachingApproach}

${isRemediation
    ? 'This is a REMEDIATION LESSON targeting specific concepts the student got wrong.'
    : 'This is an INITIAL LESSON teaching the fundamentals of this topic.'
}
${wrongQuestionsSection}
${remediationInsights ? `\nINSIGHTS FROM REMEDIATION CONVERSATIONS:\n${remediationInsights}` : ''}

Write a comprehensive, engaging lesson in Markdown format. Use LaTeX for all math ($...$ inline, $$...$$ display).

STRUCTURE YOUR LESSON AS FOLLOWS:

1. **Introduction** — Brief, motivating introduction to the concept
2. **Core Concepts** — Teach the underlying mathematical concepts clearly
   - Use clear definitions and properties
   - Provide intuitive explanations
3. **Worked Examples** — Walk through examples step by step
${wrongQuestions.length > 0
    ? `4. **Your Exam Questions Explained** — For EACH question the student got wrong:
   - Show the question
   - Explain why their answer was incorrect (or why they might have been unsure)
   - Walk through the correct solution step by step
   - Highlight the key concept or technique needed`
    : ''}
5. **Key Takeaways** — Summarize the most important points
6. **Video Resources** — Suggest 2-3 relevant Khan Academy or educational video topics (describe what to search for)

STYLE:
- Write at a high school level, friendly but not condescending
- Use encouraging language
- Break complex ideas into digestible steps
- Use analogies where helpful
- Bold key terms and formulas`
}
