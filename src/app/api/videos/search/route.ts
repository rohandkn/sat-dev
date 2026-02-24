import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ videos: [] })
  }

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      q: `${query} SAT math tutorial`,
      type: 'video',
      maxResults: '3',
      videoEmbeddable: 'true',
      relevanceLanguage: 'en',
      key: apiKey,
    })

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
    if (!res.ok) {
      return NextResponse.json({ videos: [] })
    }

    const data = await res.json()
    const videos = (data.items ?? []).map((item: {
      id: { videoId: string }
      snippet: { title: string; channelTitle: string }
    }) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
    }))

    return NextResponse.json({ videos })
  } catch {
    return NextResponse.json({ videos: [] })
  }
}
