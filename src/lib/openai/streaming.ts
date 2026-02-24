import { getOpenAIClient } from './client'

export async function streamChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number
    maxTokens?: number
  }
): Promise<ReadableStream<Uint8Array>> {
  const openai = getOpenAIClient()

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 4096,
    stream: true,
  })

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            controller.enqueue(encoder.encode(content))
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

export async function jsonChatCompletion<T>(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  jsonSchema: Record<string, unknown>,
  schemaName: string,
  temperature = 0.7
): Promise<T> {
  const openai = getOpenAIClient()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema: jsonSchema,
      },
    },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('No content in response')

  return JSON.parse(content) as T
}
