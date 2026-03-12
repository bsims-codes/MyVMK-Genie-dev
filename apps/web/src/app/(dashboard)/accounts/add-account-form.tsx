'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AddAccountFormProps {
  userId: string
}

export function AddAccountForm({ userId }: AddAccountFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!nickname.trim() || !username.trim() || !password.trim()) {
      setError('All fields are required')
      return
    }

    const supabase = createClient()

    // Simple base64 encoding for demo - in production use proper encryption
    const encodedPassword = btoa(password)

    const { error: insertError } = await supabase
      .from('game_accounts')
      .insert({
        user_id: userId,
        nickname: nickname.trim(),
        username: username.trim(),
        password_encrypted: encodedPassword,
      })

    if (insertError) {
      setError('Failed to add account')
      console.error(insertError)
      return
    }

    setNickname('')
    setUsername('')
    setPassword('')
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white/10 border border-white/10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-sm text-purple-200 mb-1">Nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g., Main Account"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="MyVMK username"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="MyVMK password"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
      >
        {isPending ? 'Adding...' : 'Add Account'}
      </button>
    </form>
  )
}
