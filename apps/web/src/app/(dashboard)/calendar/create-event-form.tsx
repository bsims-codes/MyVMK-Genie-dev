'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface CreateEventFormProps {
  userId: string
}

const CATEGORIES = [
  'general',
  'parade',
  'fireworks',
  'games',
  'meetup',
  'party',
  'contest',
]

export function CreateEventForm({ userId }: CreateEventFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [location, setLocation] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!title.trim() || !eventTime) {
      setError('Title and event time are required')
      return
    }

    const supabase = createClient()

    const { error: insertError } = await supabase
      .from('events')
      .insert({
        creator_id: userId,
        title: title.trim(),
        description: description.trim() || null,
        category,
        location: location.trim() || null,
        event_time: new Date(eventTime).toISOString(),
        is_approved: false, // Events need approval
      })

    if (insertError) {
      setError('Failed to create event')
      console.error(insertError)
      return
    }

    setSuccess('Event submitted for approval!')
    setTitle('')
    setDescription('')
    setCategory('general')
    setLocation('')
    setEventTime('')
    setIsOpen(false)
    startTransition(() => {
      router.refresh()
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-4 rounded-xl bg-white/10 border border-white/10 border-dashed hover:bg-white/15 text-purple-300 hover:text-white transition"
      >
        + Create New Event
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white/10 border border-white/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="md:col-span-2">
          <label className="block text-sm text-purple-200 mb-1">Event Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Main Street Fireworks Show"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Date & Time *</label>
          <input
            type="datetime-local"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat} className="bg-indigo-900">
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-purple-200 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Main Street USA"
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-purple-200 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people what this event is about..."
            rows={3}
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {success && <p className="text-green-400 text-sm mb-4">{success}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
        >
          {isPending ? 'Creating...' : 'Create Event'}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
        >
          Cancel
        </button>
      </div>

      <p className="text-purple-400 text-xs mt-4">
        * Events require approval before they appear publicly.
      </p>
    </form>
  )
}
