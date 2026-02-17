'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface Topic {
  id: string
  name: string
  slug: string
  description: string | null
  display_order: number
  prerequisite_topic_id: string | null
}

interface TopicProgress {
  status: string
  best_score: number | null
  attempts: number
}

interface TopicGridProps {
  topics: Topic[]
  progressMap: Map<string, TopicProgress>
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-600">Completed</Badge>
    case 'in_progress':
      return <Badge variant="secondary">In Progress</Badge>
    case 'available':
      return <Badge variant="outline">Available</Badge>
    case 'locked':
    default:
      return <Badge variant="outline" className="opacity-50">Locked</Badge>
  }
}

export function TopicGrid({ topics, progressMap }: TopicGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {topics.map((topic, index) => {
        const progress = progressMap.get(topic.id)
        // First topic is always available if no progress exists
        const status = progress?.status ?? (index === 0 ? 'available' : 'locked')
        const isAccessible = status !== 'locked'

        const content = (
          <Card className={`transition-all ${isAccessible ? 'hover:shadow-md cursor-pointer' : 'opacity-60'}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{topic.name}</CardTitle>
                {statusBadge(status)}
              </div>
              {topic.description && (
                <CardDescription className="text-xs">{topic.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {progress?.best_score != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Best: {Math.round(progress.best_score)}%</span>
                    <span>{progress.attempts} attempt{progress.attempts !== 1 ? 's' : ''}</span>
                  </div>
                  <Progress value={progress.best_score} className="h-2" />
                </div>
              )}
              {!progress?.best_score && isAccessible && (
                <p className="text-xs text-muted-foreground">Ready to start</p>
              )}
            </CardContent>
          </Card>
        )

        if (isAccessible) {
          return (
            <Link key={topic.id} href={`/topics/${topic.slug}`}>
              {content}
            </Link>
          )
        }

        return <div key={topic.id}>{content}</div>
      })}
    </div>
  )
}
