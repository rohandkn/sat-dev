import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all progress
    const { data: progress } = await supabase
      .from('user_topic_progress')
      .select('*, topics(name, slug, category_id, display_order)')
      .eq('user_id', user.id)

    // Fetch student models
    const { data: models } = await supabase
      .from('student_models')
      .select('topic_id, mastery_level')
      .eq('user_id', user.id)

    const modelMap = new Map(
      (models ?? []).map(m => [m.topic_id, m.mastery_level])
    )

    // Combine
    const enrichedProgress = (progress ?? []).map(p => ({
      ...p,
      mastery_level: modelMap.get(p.topic_id) ?? 0,
    }))

    return NextResponse.json({ progress: enrichedProgress })
  } catch (error) {
    console.error('Progress fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
