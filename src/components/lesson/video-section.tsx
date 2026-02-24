'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface Video {
  id: string
  title: string
  channel: string
}

interface VideoSectionProps {
  topicName: string
}

export function VideoSection({ topicName }: VideoSectionProps) {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/videos/search?q=${encodeURIComponent(topicName)}`)
      .then(r => r.json())
      .then(data => setVideos(data.videos ?? []))
      .catch(() => setVideos([]))
      .finally(() => setLoading(false))
  }, [topicName])

  if (!loading && videos.length === 0) return null

  return (
    <div className="border-t pt-6 space-y-4">
      <h2 className="text-lg font-semibold">Video Resources</h2>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="aspect-video w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {videos.map(video => (
            <div key={video.id} className="space-y-1.5">
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
                <iframe
                  src={`https://www.youtube.com/embed/${video.id}`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
              <p className="text-sm font-medium leading-tight line-clamp-2">{video.title}</p>
              <p className="text-xs text-muted-foreground">{video.channel}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
