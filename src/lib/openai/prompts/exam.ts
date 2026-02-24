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
}

export function buildExamPrompt(input: ExamPromptInput): string {
  const {
    topicName,
    topicDescription,
    examType,
    questionCount,
    studentModel,
    priorWrongQuestions,
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

  return `You are an expert SAT Math tutor creating exam questions.

TOPIC: ${topicName}
DESCRIPTION: ${topicDescription}

${context}
${studentContext}
${wrongQuestionsContext}

Generate exactly ${questionCount} multiple-choice questions for the SAT Math section.

REQUIREMENTS:
- Each question must be SAT-style with 4 answer choices (A, B, C, D)
- Use LaTeX notation for ALL math: $...$ for inline, $$...$$ for display
- EVERY math expression must be wrapped in $...$, including in choice values — write "$\frac{2}{3}$" not "\frac{2}{3}"
- Questions should be at SAT difficulty level
- Vary the difficulty across questions
- Each question should test a distinct concept within the topic
- Do NOT repeat the same question structure — vary the problem types

MATHEMATICAL ACCURACY (critical — follow exactly):
1. Solve the problem completely in your head before writing anything. Confirm the numerical answer.
2. Write the explanation as ONE clean, linear solution path showing each algebraic step. The final line must state the answer unambiguously (e.g. "Therefore $x = 1$").
3. Write the four choices, placing the answer from step 2 under one of the letters (A–D). The other three choices must be distinct plausible distractors with different values.
4. Set correct_answer to the letter whose value matches the answer in the explanation.
5. Do NOT include "rechecking", "verifying", "however", "alternatively", or any second computation in the explanation. One path, one answer, done.`
}
