import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canTransition } from '@/lib/learning-loop/state-machine'
import { z } from 'zod'

const requestSchema = z.object({
  sessionId: z.string().uuid(),
  targetState: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400 })
    }

    const { sessionId, targetState } = parsed.data

    const { data: session } = await supabase
      .from('learning_sessions')
      .select('state')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (!canTransition(session.state, targetState)) {
      return NextResponse.json(
        { error: `Invalid transition: ${session.state} → ${targetState}` },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('learning_sessions')
      .update({ state: targetState, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update session state' }, { status: 500 })
    }

    return NextResponse.json({ state: targetState })
  } catch (error) {
    console.error('Session transition error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
