import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { initializeUserProgress } from '@/lib/learning-loop/progression'
import { z } from 'zod'

const requestSchema = z.object({
  topicId: z.string().uuid(),
  topicSlug: z.string().min(1),
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

    const { topicId, topicSlug } = parsed.data

    // Fetch topic to get category slug for progress initialization
    const { data: topic } = await supabase
      .from('topics')
      .select('id, categories!inner(slug)')
      .eq('id', topicId)
      .single()

    if (!topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    }

    const categorySlug = (topic.categories as unknown as { slug: string }).slug

    // Ensure all topics in the category have progress rows (idempotent)
    await initializeUserProgress(supabase, user.id, categorySlug)

    // Parallel reads: session count + student model existence + current attempt count
    const [sessionCountResult, studentModelResult, progressResult] = await Promise.all([
      supabase
        .from('learning_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('topic_id', topicId),
      supabase
        .from('student_models')
        .select('id')
        .eq('user_id', user.id)
        .eq('topic_id', topicId)
        .single(),
      supabase
        .from('user_topic_progress')
        .select('attempts')
        .eq('user_id', user.id)
        .eq('topic_id', topicId)
        .single(),
    ])

    const sessionCount = sessionCountResult.count ?? 0
    const currentAttempts = progressResult.data?.attempts ?? 0

    // Parallel writes: create session + ensure student model + update progress
    const [sessionResult] = await Promise.all([
      supabase
        .from('learning_sessions')
        .insert({
          user_id: user.id,
          topic_id: topicId,
          state: 'pre_exam_pending',
          session_number: sessionCount + 1,
        })
        .select()
        .single(),
      ...(!studentModelResult.data
        ? [supabase.from('student_models').insert({ user_id: user.id, topic_id: topicId })]
        : []),
      supabase
        .from('user_topic_progress')
        .upsert(
          {
            user_id: user.id,
            topic_id: topicId,
            status: 'in_progress',
            attempts: currentAttempts + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,topic_id' }
        ),
    ])

    if (sessionResult.error || !sessionResult.data) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    return NextResponse.json({ sessionId: sessionResult.data.id, topicSlug })
  } catch (error) {
    console.error('Session start error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
