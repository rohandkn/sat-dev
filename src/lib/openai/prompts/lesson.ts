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
QUESTIONS YOU GOT WRONG (you MUST address each one):
${wrongQuestions.map((q, i) => `
Question ${i + 1}: ${q.question_text}
Choices: ${Object.entries(q.choices).map(([k, v]) => `${k}) ${v}`).join(', ')}
Correct Answer: ${q.correct_answer}
Your Answer: ${q.is_idk ? 'Said "I don\'t know"' : q.user_answer}
Explanation: ${q.explanation}
`).join('\n')}`
    : ''

  const isRemediation = lessonType === 'remediation'

  let teachingApproach = ''
  if (isRemediation && sessionNumber > 1) {
    teachingApproach = `
IMPORTANT: This is attempt #${sessionNumber} at remediation. You have already seen a lesson on these concepts but still struggled. Use a DIFFERENT teaching approach:
- Try different analogies and examples
- Break concepts down into smaller steps
- Use more visual/concrete explanations
- Start from an even more fundamental level`
  }

  return `You are an expert SAT Math tutor creating a ${isRemediation ? 'remediation' : 'personalized'} lesson. Write directly to the student using second person ("you", "your") throughout — never refer to the student in third person ("the student", "their").

TOPIC: ${topicName}
DESCRIPTION: ${topicDescription}
${studentContext}
${teachingApproach}

${isRemediation
    ? 'This is a REMEDIATION LESSON targeting specific concepts you got wrong.'
    : 'This is an INITIAL LESSON teaching the fundamentals of this topic.'
}
${wrongQuestionsSection}
${remediationInsights ? `\nINSIGHTS FROM REMEDIATION CONVERSATIONS:\n${remediationInsights}` : ''}

Write a comprehensive, engaging lesson in Markdown format.

MATH FORMATTING (critical — follow EVERY rule exactly):
- EVERY mathematical expression, variable, or number used as math MUST be wrapped in $...$ for inline or $$...$$ for display math
- Even single variables like x, y, z MUST be wrapped: WRONG: "solve for y" — CORRECT: "solve for $y$"
- NEVER write bare LaTeX commands outside math delimiters — WRONG: \frac{2}{3} — CORRECT: $\frac{2}{3}$
- NEVER write bare \left or \right outside $...$ — WRONG: \left(4\right) — CORRECT: $\left(4\right)$
- For inequalities, ALWAYS use LaTeX commands INSIDE $...$: WRONG: x \leq 3 — CORRECT: $x \leq 3$
- Keep the ENTIRE inequality expression in ONE $...$: WRONG: $x$ \leq $3$ — CORRECT: $x \leq 3$
- NEVER put a space before the closing $ — WRONG: $y = 4x - 2 $ — CORRECT: $y = 4x - 2$
- NEVER put a space after the opening $ — WRONG: $ y = 4x$ — CORRECT: $y = 4x$
- NEVER leave a lone $ without a matching closing $ on the same line
- ALWAYS put a SPACE before and after every $...$ expression in prose — WRONG: "value of$y$when$x = 2$" — CORRECT: "value of $y$ when $x = 2$"
- ALWAYS put a SPACE between a closing $ and the next word — WRONG: "$y = 3$into$x$" — CORRECT: "$y = 3$ into $x$"
- ALWAYS put a SPACE between a word and an opening $ — WRONG: "substitute$y$" — CORRECT: "substitute $y$"
- This applies everywhere: explanations, worked examples, question text

STRUCTURE YOUR LESSON AS FOLLOWS:

1. **Introduction** — Brief, motivating introduction to the concept
2. **Core Concepts** — Teach the underlying mathematical concepts clearly
   - Use clear definitions and properties
   - Provide intuitive explanations
3. **Worked Examples** — Walk through examples step by step
${wrongQuestions.length > 0
    ? `4. **Your Exam Questions Explained** — For EACH question you got wrong:
   - Show the question text directly, WITHOUT wrapping it in parentheses
   - Explain why your answer was incorrect (or why you might have been unsure)
   - Walk through the correct solution step by step
   - Highlight the key concept or technique needed`
    : ''}
5. **Key Takeaways** — Summarize the most important points

STEP-BY-STEP FORMATTING (critical):
- When showing algebraic steps, put EACH step on its OWN line using display math ($$...$$)
- This applies to BOTH equations (=) AND inequalities (\leq, \geq, <, >)
- WRONG (all on one line): "$6x = 12$ $x = 2$"
- WRONG (inequalities on one line): "$-2x \geq 8$ $x \leq -4$"
- CORRECT (each step on its own line):
  $$6x = 12$$
  $$x = 2$$
- CORRECT (inequality steps on separate lines):
  $$-2x \geq 8$$
  $$x \leq -4$$
- IMPORTANT: Only flip an inequality sign when multiplying/dividing by a negative number for <, >, \leq, \geq. Do NOT flip for \neq.
- NEVER wrap display equations in square brackets — WRONG: "$$[ 6x = 12 ]$$" — CORRECT: "$$6x = 12$$"
- NEVER use \\[...\\] notation for display math — use $$...$$ instead
- NEVER use \\(...\\) notation for inline math — use $...$ instead

STYLE:
- Write at a high school level, friendly but not condescending
- Use encouraging language ("you got this", "let's work through it together")
- Break complex ideas into digestible steps
- Use analogies where helpful
- Bold key terms and formulas`
}
