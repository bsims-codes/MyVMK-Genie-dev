import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PhrasesForm } from './phrases-form'

export default async function PhrasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: phrases } = await supabase
    .from('phrases')
    .select('*')
    .eq('user_id', user.id)
    .order('slot', { ascending: true })

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
            <h1 className="text-2xl font-bold text-white">Quick Phrases</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200">
            Set up quick phrases that you can trigger with hotkeys while playing MyVMK.
            Use slots 1-10 corresponding to keys 1-0 on your keyboard.
          </p>
        </div>

        <PhrasesForm initialPhrases={phrases || []} userId={user.id} />
      </main>
    </div>
  )
}
