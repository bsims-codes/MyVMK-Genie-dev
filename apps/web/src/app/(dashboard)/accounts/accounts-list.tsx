'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Account {
  id: string
  nickname: string
  username: string
  created_at: string
}

interface AccountsListProps {
  accounts: Account[]
}

export function AccountsList({ accounts }: AccountsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this account?')) {
      return
    }

    setDeletingId(id)
    const supabase = createClient()

    const { error } = await supabase
      .from('game_accounts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting account:', error)
    }

    setDeletingId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  if (accounts.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <p className="text-purple-300">No accounts saved yet. Add one above!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {accounts.map((account) => (
        <div
          key={account.id}
          className="flex items-center justify-between p-4 rounded-xl bg-white/10 border border-white/10"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
              {account.nickname.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{account.nickname}</p>
              <p className="text-purple-300 text-sm">{account.username}</p>
            </div>
          </div>
          <button
            onClick={() => handleDelete(account.id)}
            disabled={isPending || deletingId === account.id}
            className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 text-sm transition disabled:opacity-50"
          >
            {deletingId === account.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ))}
    </div>
  )
}
