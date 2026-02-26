interface ExamPromptInput {
  topicName: string
  topicDescription: string
  examType: 'pre' | 'post' | 'remediation'
  questionCount: number
  studentModel?: {
    strengths: string[]
    weaknesses: string[]
    misconceptions: string[]
    mastery_level: number
  }
  priorWrongQuestions?: Array<{
    question_text: string
    correct_answer: string
    user_answer: string | null
  }>
  avoidQuestions?: string[]
}

export function buildExamPrompt(input: ExamPromptInput): string {
  const {
    topicName,
    topicDescription,
    examType,
    questionCount,
    studentModel,
    priorWrongQuestions,
    avoidQuestions,
  } = input

  let context = ''

  if (examType === 'pre') {
    context = `This is a PRE-EXAM diagnostic. Generate questions that cover the full range of difficulty for this topic to assess the student's current understanding. Include easy, medium, and hard questions.`
  } else if (examType === 'post') {
    context = `This is a POST-EXAM assessment after the student has completed a lesson. Generate questions that test whether the student has learned the material. Focus on the concepts taught in the lesson.`
  } else {
    context = `This is a REMEDIATION EXAM. Generate questions specifically targeting the concepts the student previously got wrong. Focus on testing understanding of previously missed concepts with different numbers/scenarios.`
  }

  let studentContext = ''
  if (studentModel && (studentModel.strengths.length > 0 || studentModel.weaknesses.length > 0)) {
    studentContext = `
STUDENT PROFILE:
- Strengths: ${studentModel.strengths.join(', ') || 'None identified yet'}
- Weaknesses: ${studentModel.weaknesses.join(', ') || 'None identified yet'}
- Misconceptions: ${studentModel.misconceptions.join(', ') || 'None identified yet'}
- Mastery Level: ${studentModel.mastery_level}%`
  }

  let wrongQuestionsContext = ''
  if (priorWrongQuestions && priorWrongQuestions.length > 0) {
    wrongQuestionsContext = `
PREVIOUSLY MISSED QUESTIONS (generate new questions testing these same concepts):
${priorWrongQuestions.map((q, i) => `${i + 1}. ${q.question_text} (Correct: ${q.correct_answer}, Student answered: ${q.user_answer ?? 'IDK'})`).join('\n')}`
  }

  let avoidQuestionsContext = ''
  if (avoidQuestions && avoidQuestions.length > 0) {
    avoidQuestionsContext = `
QUESTIONS TO AVOID REPEATING (do NOT reuse these exact questions or numbers):
${avoidQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
  }

  return `You are an expert SAT Math tutor creating exam questions.

TOPIC: ${topicName}
DESCRIPTION: ${topicDescription}

${context}
${studentContext}
${wrongQuestionsContext}
${avoidQuestionsContext}

Generate exactly ${questionCount} multiple-choice questions for the SAT Math section.

REQUIREMENTS:
- Each question must be SAT-style with 4 answer choices (A, B, C, D)
- Exactly ONE answer choice must be correct; the other three must be incorrect.
- Use LaTeX notation for ALL math: $...$ for inline, $$...$$ for display
- EVERY math expression must be wrapped in $...$, including in choice values — write "$\\frac{2}{3}$" not "\\frac{2}{3}"
- For inequalities, ALWAYS use LaTeX commands INSIDE $...$: write "$x \\leq 3$" not "$x$ ≤ $3$" or "x \\leq 3"
- NEVER write \\leq, \\geq, \\neq, \\frac, \\left, \\right, or ANY LaTeX command outside of $...$
- ALWAYS put a SPACE between a word and an opening $ — WRONG: "solve$x$" — CORRECT: "solve $x$"
- ALWAYS put a SPACE between a closing $ and the next word — WRONG: "$x = 3$and" — CORRECT: "$x = 3$ and"
- Questions should be at SAT difficulty level
- Vary the difficulty across questions
- Each question should test a distinct concept within the topic
- Do NOT repeat the same question structure — vary the problem types

MATHEMATICAL ACCURACY (critical — follow exactly):
1. Solve the problem completely in your head before writing anything. Confirm the numerical answer.
2. Write the explanation as ONE clean, linear solution path showing each algebraic step, with EACH step on its OWN line. The final line must state the answer unambiguously (e.g. "Therefore $x = 1$").
3. Write the four choices, placing the answer from step 2 under one of the letters (A–D). The other three choices must be distinct plausible distractors with different values.
4. Set correct_answer to the letter whose value matches the answer in the explanation.
5. Do NOT include "rechecking", "verifying", "however", "alternatively", or any second computation in the explanation. One path, one answer, done.
6. When multiplying or dividing by a negative number, only flip inequality signs for <, >, \\leq, \\geq. Do NOT flip for \\neq.

NOT-EQUALS RULE (important):
- If the problem statement involves $\\neq$ and asks about possible values, DO NOT ask "Which of the following is a possible value for $x$?"
- Instead, reframe as "Which of the following is NOT a possible value for $x$?" so there is exactly one excluded value.
- Ensure exactly one choice is the excluded value; the other three must be valid possible values.

SYSTEMS OF EQUATIONS — CONSISTENCY RULE (critical):
- When writing a question involving a system of equations, you MUST start from a known solution point (e.g. pick $x = 2$, $y = 3$ first, then build equations that are satisfied by those values).
- NEVER write two equations and a given value unless you have verified that the given value produces the SAME answer in EVERY equation in the system.
- Example of a BAD question: "Given $4x + y = 11$ and $2x - 3y = -1$, find $y$ when $x = 3$." → Equation 1 gives $y = -1$, Equation 2 gives $y = 7/3$. The system is inconsistent at $x = 3$.
- To avoid this: pick the solution first ($x = 2$, $y = 3$), then create equations ($4(2) + 3 = 11$ ✓, $2(2) - 3(3) = -5$ ✓), then ask "What is $y$?"

GRAPHING INEQUALITIES — NOT-EQUALS RULE (critical):
- If a question involves graphing $y \\neq c$ or $x \\neq c$, the correct graph must be a dashed line at the boundary with shading on BOTH sides (all values except the line).
- You MUST ensure one answer choice explicitly shows shading on both sides of the dashed line.
- Do NOT include graphing choices that all shade only one side for $\\neq$.`
}

export function buildExamValidationPrompt(
  questions: Array<{
    question_text: string
    choices: Record<string, string>
  }>
): string {
  return `You are a strict SAT Math validator. For each question, solve it and determine which answer choices (A-D) are correct.

Rules:
- Only use the question text and choices (ignore any provided correct_answer).
- If more than one choice is correct, include all correct letters.
- If no choices are correct, return an empty array for that question.
- You MUST return a result for EVERY question. The results array must have exactly ${questions.length} items, with indices 1..${questions.length} in order.
- For graphing questions that ONLY involve a single $\\neq$ inequality (e.g. $y \\neq c$ or $x \\neq c$ with no other inequalities), the ONLY correct graph shows a dashed boundary and shading on BOTH sides. One-sided shading is incorrect.
- For systems of inequalities involving $\\neq$, a point is a solution only if it satisfies all strict inequalities and is NOT on any $\\neq$ boundary line. If the point lies exactly on the excluded line, it is NOT a solution.
- For questions of the form "$ax + b \\neq c$" that ask for NOT a possible value, the correct choice is the value that makes $ax + b = c$ (the excluded value). All other values are possible.

Return JSON matching the provided schema.

QUESTIONS:
${questions.map((q, i) => {
  const choices = Object.entries(q.choices).map(([k, v]) => `${k}) ${v}`).join('\n')
  return `${i + 1}. ${q.question_text}\n${choices}`
}).join('\n\n')}`
}
