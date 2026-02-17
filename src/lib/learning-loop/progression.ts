import { SupabaseClient } from '@supabase/supabase-js'

export async function initializeUserProgress(
  supabase: SupabaseClient,
  userId: string,
  categorySlug: string = 'algebra'
) {
  // Get all topics in the category ordered by display_order
  const { data: topics } = await supabase
    .from('topics')
    .select('id, display_order, prerequisite_topic_id, categories!inner(slug)')
    .eq('categories.slug', categorySlug)
    .order('display_order')

  if (!topics || topics.length === 0) return

  // Check existing progress
  const { data: existing } = await supabase
    .from('user_topic_progress')
    .select('topic_id')
    .eq('user_id', userId)

  const existingSet = new Set((existing ?? []).map(e => e.topic_id))

  // Create progress entries for topics that don't have them
  const newEntries = topics
    .filter(t => !existingSet.has(t.id))
    .map((t, index) => ({
      user_id: userId,
      topic_id: t.id,
      status: (index === 0 ? 'available' : 'locked') as 'available' | 'locked',
    }))

  if (newEntries.length > 0) {
    await supabase.from('user_topic_progress').insert(newEntries)
  }
}

export async function unlockNextTopic(
  supabase: SupabaseClient,
  userId: string,
  completedTopicId: string
) {
  // Find topic that has this as prerequisite
  const { data: nextTopics } = await supabase
    .from('topics')
    .select('id')
    .eq('prerequisite_topic_id', completedTopicId)

  if (!nextTopics || nextTopics.length === 0) return

  for (const nextTopic of nextTopics) {
    // Only unlock if currently locked
    await supabase
      .from('user_topic_progress')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('topic_id', nextTopic.id)
      .eq('status', 'locked')
  }
}

export async function updateTopicProgress(
  supabase: SupabaseClient,
  userId: string,
  topicId: string,
  status: 'in_progress' | 'completed',
  score?: number
) {
  const { data: existing } = await supabase
    .from('user_topic_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .single()

  if (existing) {
    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'in_progress') {
      updates.attempts = existing.attempts + 1
    }

    if (score !== undefined) {
      updates.best_score = existing.best_score
        ? Math.max(existing.best_score, score)
        : score
    }

    await supabase
      .from('user_topic_progress')
      .update(updates)
      .eq('id', existing.id)
  } else {
    await supabase
      .from('user_topic_progress')
      .insert({
        user_id: userId,
        topic_id: topicId,
        status,
        best_score: score ?? null,
        attempts: 1,
      })
  }
}
