'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getStateLabel } from '@/lib/learning-loop/state-machine'

interface TopicOverviewProps {
  topic: {
    id: string
    name: string
    slug: string
    description: string | null
    categories: { name: string } | null
  }
  progress: {
    status: string
    best_score: number | null
    attempts: number
  } | null
  activeSession: {
    id: string
    state: string
    session_number: number
    pre_exam_score: number | null
    post_exam_score: number | null
  } | null
  studentModel: {
    strengths: string[]
    weaknesses: string[]
    mastery_level: number
  } | null
  userId: string
}

export function TopicOverview({
  topic,
  progress,
  activeSession,
  studentModel,
  userId,
}: TopicOverviewProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  async function startNewSession() {
    setCreating(true)

    // Count existing sessions for this topic
    const { count } = await supabase
      .from('learning_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('topic_id', topic.id)

    const { data: session, error } = await supabase
      .from('learning_sessions')
      .insert({
        user_id: userId,
        topic_id: topic.id,
        state: 'pre_exam_pending',
        session_number: (count ?? 0) + 1,
      })
      .select()
      .single()

    if (error || !session) {
      setCreating(false)
      return
    }

    // Ensure student model exists
    const { data: existingModel } = await supabase
      .from('student_models')
      .select('id')
      .eq('user_id', userId)
      .eq('topic_id', topic.id)
      .single()

    if (!existingModel) {
      await supabase.from('student_models').insert({
        user_id: userId,
        topic_id: topic.id,
      })
    }

    // Update topic progress to in_progress
    const { data: existingProgress } = await supabase
      .from('user_topic_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('topic_id', topic.id)
      .single()

    if (existingProgress) {
      await supabase
        .from('user_topic_progress')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', existingProgress.id)
    } else {
      await supabase.from('user_topic_progress').insert({
        user_id: userId,
        topic_id: topic.id,
        status: 'in_progress',
      })
    }

    router.push(`/topics/${topic.slug}/pre-exam?session=${session.id}`)
  }

  function resumeSession() {
    if (!activeSession) return

    const state = activeSession.state
    if (state.startsWith('pre_exam')) {
      router.push(`/topics/${topic.slug}/pre-exam?session=${activeSession.id}`)
    } else if (state.startsWith('lesson') && !state.includes('remediation')) {
      router.push(`/topics/${topic.slug}/lesson?session=${activeSession.id}`)
    } else if (state.startsWith('post_exam')) {
      router.push(`/topics/${topic.slug}/post-exam?session=${activeSession.id}`)
    } else if (state.includes('remediation')) {
      router.push(`/topics/${topic.slug}/review?session=${activeSession.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          {(topic.categories as { name: string } | null)?.name ?? 'Topic'}
        </p>
        <h1 className="text-3xl font-bold">{topic.name}</h1>
        {topic.description && (
          <p className="text-muted-foreground mt-2">{topic.description}</p>
        )}
      </div>

      {studentModel && studentModel.mastery_level > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Mastery:</span> {studentModel.mastery_level}%
            </div>
            {studentModel.strengths.length > 0 && (
              <div>
                <span className="font-medium">Strengths:</span>{' '}
                {studentModel.strengths.join(', ')}
              </div>
            )}
            {studentModel.weaknesses.length > 0 && (
              <div>
                <span className="font-medium">Areas to improve:</span>{' '}
                {studentModel.weaknesses.join(', ')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeSession && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Session</CardTitle>
            <CardDescription>
              Session #{activeSession.session_number}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Badge variant="secondary">{getStateLabel(activeSession.state)}</Badge>
            {activeSession.pre_exam_score !== null && (
              <p className="text-sm">Pre-exam score: {activeSession.pre_exam_score}%</p>
            )}
            {activeSession.post_exam_score !== null && (
              <p className="text-sm">Post-exam score: {activeSession.post_exam_score}%</p>
            )}
            <Button onClick={resumeSession} className="w-full">
              Resume Session
            </Button>
          </CardContent>
        </Card>
      )}

      {!activeSession && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start Learning</CardTitle>
            <CardDescription>
              {progress?.attempts
                ? `You've attempted this topic ${progress.attempts} time${progress.attempts !== 1 ? 's' : ''}${progress.best_score ? `. Best score: ${Math.round(progress.best_score)}%` : ''}`
                : 'Take a diagnostic pre-exam, then get a personalized lesson'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={startNewSession} disabled={creating} className="w-full" size="lg">
              {creating ? 'Creating session...' : progress?.attempts ? 'Start New Session' : 'Start Pre-Exam'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
