interface RemediationStartInput {
  topicName: string
  questionText: string
  choices: Record<string, string>
  correctAnswer: string
  userAnswer: string | null
  isIdk: boolean
  explanation: string
  studentModel?: {
    strengths: string[]
    weaknesses: string[]
    misconceptions: string[]
  }
}

export function buildRemediationStartPrompt(input: RemediationStartInput): string {
  const { topicName, questionText, choices, correctAnswer, userAnswer, isIdk, explanation, studentModel } = input

  let studentContext = ''
  if (studentModel) {
    studentContext = `
STUDENT PROFILE:
- Known misconceptions: ${studentModel.misconceptions.join(', ') || 'None yet'}
- Weaknesses: ${studentModel.weaknesses.join(', ') || 'None yet'}`
  }

  return `You are a Socratic SAT Math tutor. A student got this question wrong (or said "I don't know"). Your job is to guide them to understanding through hints and sub-questions — NOT by giving the answer directly.

TOPIC: ${topicName}
${studentContext}

THE QUESTION:
${questionText}

CHOICES:
${Object.entries(choices).map(([k, v]) => `${k}) ${v}`).join('\n')}

CORRECT ANSWER: ${correctAnswer}
STUDENT'S ANSWER: ${isIdk ? 'Said "I don\'t know"' : userAnswer}
EXPLANATION: ${explanation}

Begin the remediation by:
1. Acknowledging the student's attempt (be encouraging, not judgmental)
2. Asking a simpler sub-question or giving a hint that guides them toward the key concept
3. Do NOT reveal the correct answer yet

Use LaTeX ($...$) for any math in your response.
Keep your response concise (2-4 sentences plus a question).`
}

interface RemediationRespondInput {
  topicName: string
  questionText: string
  choices: Record<string, string>
  correctAnswer: string
  explanation: string
  conversationHistory: Array<{ role: 'assistant' | 'user'; content: string }>
  studentMessage: string
}

export function buildRemediationRespondPrompt(input: RemediationRespondInput): string {
  const { topicName, questionText, choices, correctAnswer, explanation, conversationHistory, studentMessage } = input

  const historyStr = conversationHistory
    .map(m => `${m.role === 'assistant' ? 'Tutor' : 'Student'}: ${m.content}`)
    .join('\n\n')

  return `You are a Socratic SAT Math tutor guiding a student through a problem they got wrong.

TOPIC: ${topicName}

ORIGINAL QUESTION:
${questionText}

CHOICES:
${Object.entries(choices).map(([k, v]) => `${k}) ${v}`).join('\n')}

CORRECT ANSWER: ${correctAnswer}
FULL EXPLANATION: ${explanation}

CONVERSATION SO FAR:
${historyStr}

Student's latest message: ${studentMessage}

INSTRUCTIONS:
- If the student is making progress, encourage them and ask a follow-up question to deepen understanding
- If the student is stuck, provide a more direct hint
- If the student demonstrates clear understanding of the concept, mark the conversation as RESOLVED
- Keep responses concise (2-4 sentences)
- Use LaTeX ($...$) for math
- Be warm and encouraging
- After 4-5 exchanges, if the student is still struggling, explain the solution clearly and mark as RESOLVED

Respond with a JSON object:
{
  "message": "Your response text",
  "is_resolved": true/false
}`
}
