'use client'

import { useState, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface RoomAudio {
  id: string
  room_name: string
  audio_url: string
  volume: number
}

interface AudioListProps {
  roomAudio: RoomAudio[]
}

export function AudioList({ roomAudio }: AudioListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this room audio setting?')) return

    setDeletingId(id)
    const supabase = createClient()

    const { error } = await supabase
      .from('room_audio')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting:', error)
    }

    setDeletingId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const togglePlay = (audio: RoomAudio) => {
    if (playingId === audio.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
      }
      audioRef.current = new Audio(audio.audio_url)
      audioRef.current.volume = audio.volume
      audioRef.current.play().catch(console.error)
      audioRef.current.onended = () => setPlayingId(null)
      setPlayingId(audio.id)
    }
  }

  if (roomAudio.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <p className="text-purple-300">No room audio settings yet. Add one above!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {roomAudio.map((audio) => (
        <div
          key={audio.id}
          className="flex items-center justify-between p-4 rounded-xl bg-white/10 border border-white/10"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => togglePlay(audio)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center text-white hover:opacity-80 transition"
            >
              {playingId === audio.id ? '⏸' : '▶'}
            </button>
            <div>
              <p className="text-white font-medium">{audio.room_name}</p>
              <p className="text-purple-300 text-sm truncate max-w-xs">
                {audio.audio_url}
              </p>
              <p className="text-purple-400 text-xs">
                Volume: {Math.round(audio.volume * 100)}%
              </p>
            </div>
          </div>
          <button
            onClick={() => handleDelete(audio.id)}
            disabled={isPending || deletingId === audio.id}
            className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 text-sm transition disabled:opacity-50"
          >
            {deletingId === audio.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ))}
    </div>
  )
}
