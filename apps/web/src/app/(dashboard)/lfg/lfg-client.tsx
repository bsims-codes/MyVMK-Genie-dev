'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Participant {
  user_id: string
  joined_at: string
}

interface Lobby {
  id: string
  host_id: string
  game_type: string
  title: string | null
  max_players: number
  status: string
  created_at: string
  expires_at: string
  lfg_participants: Participant[]
}

interface LfgClientProps {
  initialLobbies: Lobby[]
  userId: string
}

const GAME_TYPES = [
  'Pirates',
  'Jungle Cruise',
  'Fireworks',
  'Hide and Seek',
  'Trading',
  'Hangout',
  'Other',
]

export function LfgClient({ initialLobbies, userId }: LfgClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lobbies, setLobbies] = useState(initialLobbies)
  const [isCreating, setIsCreating] = useState(false)
  const [gameType, setGameType] = useState('Pirates')
  const [title, setTitle] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [error, setError] = useState('')
  const [loadingLobbyId, setLoadingLobbyId] = useState<string | null>(null)

  const supabase = createClient()

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('lfg-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lfg_lobbies' },
        () => {
          startTransition(() => {
            router.refresh()
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lfg_participants' },
        () => {
          startTransition(() => {
            router.refresh()
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, router])

  // Update lobbies when initialLobbies changes
  useEffect(() => {
    setLobbies(initialLobbies)
  }, [initialLobbies])

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const { data, error: createError } = await supabase
      .from('lfg_lobbies')
      .insert({
        host_id: userId,
        game_type: gameType,
        title: title.trim() || null,
        max_players: maxPlayers,
      })
      .select()
      .single()

    if (createError) {
      setError('Failed to create lobby')
      console.error(createError)
      return
    }

    // Auto-join as host
    await supabase
      .from('lfg_participants')
      .insert({
        lobby_id: data.id,
        user_id: userId,
      })

    setIsCreating(false)
    setTitle('')
    setGameType('Pirates')
    setMaxPlayers(4)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleJoin = async (lobbyId: string) => {
    setLoadingLobbyId(lobbyId)

    const { error } = await supabase
      .from('lfg_participants')
      .insert({
        lobby_id: lobbyId,
        user_id: userId,
      })

    if (error) {
      console.error('Join error:', error)
    }

    setLoadingLobbyId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleLeave = async (lobbyId: string) => {
    setLoadingLobbyId(lobbyId)

    const { error } = await supabase
      .from('lfg_participants')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('user_id', userId)

    if (error) {
      console.error('Leave error:', error)
    }

    setLoadingLobbyId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleClose = async (lobbyId: string) => {
    const { error } = await supabase
      .from('lfg_lobbies')
      .update({ status: 'closed' })
      .eq('id', lobbyId)

    if (error) {
      console.error('Close error:', error)
    }

    startTransition(() => {
      router.refresh()
    })
  }

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 0) return `${hours}h ${minutes}m left`
    return `${minutes}m left`
  }

  return (
    <div>
      {/* Create Lobby Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Create Lobby</h2>
        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full p-4 rounded-xl bg-white/10 border border-white/10 border-dashed hover:bg-white/15 text-purple-300 hover:text-white transition"
          >
            + Create New Lobby
          </button>
        ) : (
          <form onSubmit={handleCreateLobby} className="p-6 rounded-xl bg-white/10 border border-white/10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm text-purple-200 mb-1">Game Type</label>
                <select
                  value={gameType}
                  onChange={(e) => setGameType(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {GAME_TYPES.map(type => (
                    <option key={type} value={type} className="bg-indigo-900">{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-purple-200 mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Chill trading session"
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-purple-200 mb-1">Max Players</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {[2, 3, 4, 5, 6, 8, 10].map(n => (
                    <option key={n} value={n} className="bg-indigo-900">{n} players</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
              >
                Create Lobby
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Active Lobbies */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Active Lobbies ({lobbies.length})
        </h2>
        {lobbies.length === 0 ? (
          <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
            <p className="text-purple-300">No active lobbies. Create one above!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lobbies.map((lobby) => {
              const isHost = lobby.host_id === userId
              const isParticipant = lobby.lfg_participants.some(p => p.user_id === userId)
              const playerCount = lobby.lfg_participants.length
              const isFull = playerCount >= lobby.max_players

              return (
                <div
                  key={lobby.id}
                  className="p-5 rounded-xl bg-white/10 border border-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white text-xl shrink-0">
                        🎮
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">
                            {lobby.title || lobby.game_type}
                          </h3>
                          {isHost && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-xs">
                              Host
                            </span>
                          )}
                          {isFull && (
                            <span className="px-2 py-0.5 rounded-full bg-yellow-500/30 text-yellow-200 text-xs">
                              Full
                            </span>
                          )}
                        </div>
                        <p className="text-purple-300 text-sm">
                          {lobby.game_type} • {playerCount}/{lobby.max_players} players • {getTimeRemaining(lobby.expires_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {isHost ? (
                        <button
                          onClick={() => handleClose(lobby.id)}
                          className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm transition"
                        >
                          Close
                        </button>
                      ) : isParticipant ? (
                        <button
                          onClick={() => handleLeave(lobby.id)}
                          disabled={loadingLobbyId === lobby.id}
                          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-purple-300 text-sm transition disabled:opacity-50"
                        >
                          {loadingLobbyId === lobby.id ? '...' : 'Leave'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleJoin(lobby.id)}
                          disabled={loadingLobbyId === lobby.id || isFull}
                          className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 text-white text-sm transition disabled:opacity-50"
                        >
                          {loadingLobbyId === lobby.id ? '...' : 'Join'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
