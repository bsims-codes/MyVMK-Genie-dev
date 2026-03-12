import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AccountsList } from './accounts-list'
import { AddAccountForm } from './add-account-form'

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: accounts } = await supabase
    .from('game_accounts')
    .select('id, nickname, username, created_at')
    .eq('user_id', user.id)
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
            <h1 className="text-2xl font-bold text-white">Game Accounts</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200">
            Store your MyVMK account credentials securely. Passwords are encrypted before storage.
          </p>
        </div>

        {/* Add Account Form */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Add Account</h2>
          <AddAccountForm userId={user.id} />
        </div>

        {/* Accounts List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Your Accounts ({accounts?.length || 0})
          </h2>
          <AccountsList accounts={accounts || []} />
        </div>
      </main>
    </div>
  )
}
