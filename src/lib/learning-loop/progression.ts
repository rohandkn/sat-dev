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

  // Create progress entries for topics that don't have them.
  // Only the very first topic (display_order = 1) starts as 'available' when the user
  // has no progress at all. All other new entries start 'locked' so that unlockNextTopic
  // controls progression correctly.
  const noExistingProgress = existingSet.size === 0
  const newEntries = topics
    .filter(t => !existingSet.has(t.id))
    .map(t => ({
      user_id: userId,
      topic_id: t.id,
      status: (noExistingProgress && t.display_order === 1 ? 'available' : 'locked') as 'available' | 'locked',
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

