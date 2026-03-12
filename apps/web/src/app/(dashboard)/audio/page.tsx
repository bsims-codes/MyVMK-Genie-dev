import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AudioList } from './audio-list'
import { AddAudioForm } from './add-audio-form'

export default async function AudioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: roomAudio } = await supabase
    .from('room_audio')
    .select('*')
    .eq('user_id', user.id)
    .order('room_name', { ascending: true })

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
            <h1 className="text-2xl font-bold text-white">Room Audio</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200">
            Set custom background music for different MyVMK rooms.
            The browser extension will play your custom audio when you enter these rooms.
          </p>
        </div>

        {/* Add Audio Form */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Add Room Audio</h2>
          <AddAudioForm userId={user.id} />
        </div>

        {/* Audio List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Your Room Audio Settings ({roomAudio?.length || 0})
          </h2>
          <AudioList roomAudio={roomAudio || []} />
        </div>
      </main>
    </div>
  )
}
