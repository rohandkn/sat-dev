import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TopicGrid } from '@/components/dashboard/topic-grid'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch categories with topics
  const { data: categories } = await supabase
    .from('categories')
    .select('*, topics(*)')
    .order('display_order')

  // Fetch user progress
  const { data: progress } = await supabase
    .from('user_topic_progress')
    .select('*')
    .eq('user_id', user.id)

  // Build progress map
  const progressMap = new Map(
    (progress ?? []).map(p => [p.topic_id, p])
  )

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">SAT Math Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Track your progress and master SAT Math topics
        </p>
      </div>

      {(categories ?? []).map((category) => (
        <section key={category.id} className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{category.name}</h2>
            {category.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
          <TopicGrid
            topics={(category.topics as Array<{
              id: string
              name: string
              slug: string
              description: string | null
              display_order: number
              prerequisite_topic_id: string | null
            }>).sort((a, b) => a.display_order - b.display_order)}
            progressMap={progressMap}
          />
        </section>
      ))}
    </div>
  )
}
