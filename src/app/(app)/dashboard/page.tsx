import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { TopicGrid } from '@/components/dashboard/topic-grid'

// Categories + topics are seed data with no user-scoped RLS — cache globally for 1 hour
const getCategoriesWithTopics = unstable_cache(
  async () => {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    return supabase.from('categories').select('*, topics(*)').order('display_order')
  },
  ['dashboard-categories'],
  { tags: ['categories'], revalidate: 3600 }
)

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Categories/topics are seed data — served from cache
  const { data: categories, error: categoriesError } = await getCategoriesWithTopics()

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

      {categoriesError && (
        <p className="text-destructive text-sm">
          Failed to load topics: {categoriesError.message}
        </p>
      )}

      {!categoriesError && (categories ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">
          No topics found. The database may not be seeded yet.
        </p>
      )}

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
