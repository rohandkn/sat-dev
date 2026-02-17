import { z } from 'zod'

// Exam question schema for structured output
export const examQuestionSchema = z.object({
  question_text: z.string(),
  choices: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }),
  correct_answer: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string(),
})

export const examGenerationSchema = z.object({
  questions: z.array(examQuestionSchema),
})

export type ExamQuestion = z.infer<typeof examQuestionSchema>
export type ExamGeneration = z.infer<typeof examGenerationSchema>

// Student model update schema
export const studentModelUpdateSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  misconceptions: z.array(z.string()),
  mastery_level: z.number(),
})

export type StudentModelUpdate = z.infer<typeof studentModelUpdateSchema>

// Remediation response schema
export const remediationResponseSchema = z.object({
  message: z.string(),
  is_resolved: z.boolean(),
})

export type RemediationResponse = z.infer<typeof remediationResponseSchema>

// Video link schema used in lessons
export const videoLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
})

export type VideoLink = z.infer<typeof videoLinkSchema>

// Manually defined JSON schemas for OpenAI structured output
// (avoids runtime introspection issues with Zod v4)

export const examGenerationJsonSchema = {
  type: 'object' as const,
  properties: {
    questions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          question_text: { type: 'string' as const },
          choices: {
            type: 'object' as const,
            properties: {
              A: { type: 'string' as const },
              B: { type: 'string' as const },
              C: { type: 'string' as const },
              D: { type: 'string' as const },
            },
            required: ['A', 'B', 'C', 'D'],
            additionalProperties: false,
          },
          correct_answer: { type: 'string' as const, enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: 'string' as const },
        },
        required: ['question_text', 'choices', 'correct_answer', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
}

export const studentModelUpdateJsonSchema = {
  type: 'object' as const,
  properties: {
    strengths: { type: 'array' as const, items: { type: 'string' as const } },
    weaknesses: { type: 'array' as const, items: { type: 'string' as const } },
    misconceptions: { type: 'array' as const, items: { type: 'string' as const } },
    mastery_level: { type: 'number' as const },
  },
  required: ['strengths', 'weaknesses', 'misconceptions', 'mastery_level'],
  additionalProperties: false,
}

export const remediationResponseJsonSchema = {
  type: 'object' as const,
  properties: {
    message: { type: 'string' as const },
    is_resolved: { type: 'boolean' as const },
  },
  required: ['message', 'is_resolved'],
  additionalProperties: false,
}
