import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopicOverview } from './topic-overview'

interface TopicPageProps {
  params: Promise<{ topicSlug: string }>
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { topicSlug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: topic } = await supabase
    .from('topics')
    .select('*, categories(*)')
    .eq('slug', topicSlug)
    .single()

  if (!topic) redirect('/dashboard')

  // Get or create user progress for this topic
  const { data: progress } = await supabase
    .from('user_topic_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('topic_id', topic.id)
    .single()

  // Get active session if any
  const { data: activeSession } = await supabase
    .from('learning_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('topic_id', topic.id)
    .not('state', 'in', '("session_passed","session_failed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Get student model
  const { data: studentModel } = await supabase
    .from('student_models')
    .select('*')
    .eq('user_id', user.id)
    .eq('topic_id', topic.id)
    .single()

  return (
    <TopicOverview
      topic={topic}
      progress={progress}
      activeSession={activeSession}
      studentModel={studentModel}
      userId={user.id}
    />
  )
}
