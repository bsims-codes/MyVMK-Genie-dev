'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface AddAudioFormProps {
  userId: string
}

const POPULAR_ROOMS = [
  'Main Street',
  'Adventureland',
  'Frontierland',
  'Fantasyland',
  'Tomorrowland',
  'Pirates of the Caribbean',
  'Haunted Mansion',
  'Space Mountain',
  'Jungle Cruise',
  'Its a Small World',
]

export function AddAudioForm({ userId }: AddAudioFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [roomName, setRoomName] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [volume, setVolume] = useState(0.5)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!roomName.trim() || !audioUrl.trim()) {
      setError('Room name and audio URL are required')
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase
      .from('room_audio')
      .upsert({
        user_id: userId,
        room_name: roomName.trim(),
        audio_url: audioUrl.trim(),
        volume,
      }, { onConflict: 'user_id,room_name' })

    if (insertError) {
      setError('Failed to save audio setting')
      console.error(insertError)
      return
    }

    setRoomName('')
    setAudioUrl('')
    setVolume(0.5)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white/10 border border-white/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-purple-200 mb-1">Room Name</label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="e.g., Main Street"
            list="room-suggestions"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <datalist id="room-suggestions">
            {POPULAR_ROOMS.map(room => (
              <option key={room} value={room} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Audio URL</label>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://example.com/audio.mp3"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm text-purple-200 mb-1">
          Volume: {Math.round(volume * 100)}%
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full accent-purple-500"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
      >
        {isPending ? 'Saving...' : 'Save Room Audio'}
      </button>
    </form>
  )
}
