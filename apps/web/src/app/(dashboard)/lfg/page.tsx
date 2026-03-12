import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LfgClient } from './lfg-client'

export default async function LfgPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get active lobbies with participants
  const { data: lobbies } = await supabase
    .from('lfg_lobbies')
    .select(`
      *,
      lfg_participants (
        user_id,
        joined_at
      )
    `)
    .in('status', ['waiting', 'full'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-purple-300 hover:text-white transition"
            >
              &larr; Back
            </Link>
            <h1 className="text-2xl font-bold text-white">Looking for Game</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200">
            Find other players to join games with! Create a lobby or join an existing one.
            Lobbies update in real-time.
          </p>
        </div>

        <LfgClient initialLobbies={lobbies || []} userId={user.id} />
      </main>
    </div>
  )
}
