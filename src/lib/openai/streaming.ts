import { getOpenAIClient } from './client'

// Recover LaTeX commands corrupted by JSON string escape interpretation.
// When the LLM generates \neq inside a JSON string value, JSON treats \n
// as a newline escape — turning \neq into newline + "eq".  Similarly \frac
// becomes form-feed + "rac", \right becomes CR + "ight", \text becomes
// tab + "ext", etc.  This function detects those corrupted patterns and
// restores the original LaTeX commands.
function fixCorruptedLatex(text: string): string {
  let s = text
  // \n (newline) → \neq, \neg, \nu, \nabla, \not, \notin, \ni, \nleq, \ngeq
  s = s.replace(/\n(eq|eg|u|abla|ot|otin|i|leq|geq|mid)(?![a-zA-Z])/g, '\\n$1')
  // \t (tab) → \text, \textbf, \times, \theta, \tan, \to, \top, \triangle
  s = s.replace(/\t(ext|extbf|extit|imes|heta|an|o\b|op|riangle|ilde)(?![a-zA-Z])/g, '\\t$1')
  // \r (carriage return) → \right, \rangle, \rceil, \rfloor, \rho
  s = s.replace(/\r(ight|angle|ceil|floor|ho)(?![a-zA-Z])/g, '\\r$1')
  // \f (form feed) → \frac, \forall
  s = s.replace(/\f(rac|orall)(?![a-zA-Z])/g, '\\f$1')
  // \b (backspace = \x08) → \boxed, \binom, \beta, \bar, \begin, \bmod
  s = s.replace(/\x08(oxed|inom|eta|ar|egin|mod)(?![a-zA-Z])/g, '\\b$1')
  return s
}

// Recursively walk an object and apply fixCorruptedLatex to every string value.
function sanitizeLatexStrings<T>(obj: T): T {
  if (typeof obj === 'string') return fixCorruptedLatex(obj) as T
  if (Array.isArray(obj)) return obj.map(sanitizeLatexStrings) as T
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeLatexStrings(value)
    }
    return result as T
  }
  return obj
}

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

  return sanitizeLatexStrings(JSON.parse(content) as T)
}
