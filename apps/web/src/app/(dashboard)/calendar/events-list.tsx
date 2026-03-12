'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Event {
  id: string
  creator_id: string | null
  title: string
  description: string | null
  event_time: string
  category: string
  location: string | null
  is_approved: boolean
  is_official?: boolean
  event_rsvps: { user_id: string; status: string }[]
}

interface EventsListProps {
  events: Event[]
  currentUserId: string
}

const CATEGORY_COLORS: Record<string, string> = {
  general: 'from-gray-500 to-slate-500',
  parade: 'from-yellow-500 to-orange-500',
  fireworks: 'from-purple-500 to-pink-500',
  games: 'from-green-500 to-emerald-500',
  meetup: 'from-blue-500 to-cyan-500',
  party: 'from-pink-500 to-rose-500',
  contest: 'from-red-500 to-orange-500',
}

export function EventsList({ events, currentUserId }: EventsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loadingEventId, setLoadingEventId] = useState<string | null>(null)

  const handleRsvp = async (eventId: string, status: 'going' | 'maybe' | 'not_going') => {
    setLoadingEventId(eventId)
    const supabase = createClient()

    const { error } = await supabase
      .from('event_rsvps')
      .upsert({
        event_id: eventId,
        user_id: currentUserId,
        status,
      })

    if (error) {
      console.error('RSVP error:', error)
    }

    setLoadingEventId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    // Date is already in Eastern time (no conversion needed)
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date) + ' ET'
  }

  if (events.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <p className="text-purple-300">No upcoming events. Create one above!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {events.map((event) => {
        const userRsvp = event.event_rsvps.find(r => r.user_id === currentUserId)
        const goingCount = event.event_rsvps.filter(r => r.status === 'going').length
        const isOfficial = event.is_official
        const colorClass = isOfficial
          ? 'from-amber-500 to-orange-500'
          : (CATEGORY_COLORS[event.category] || CATEGORY_COLORS.general)

        return (
          <div
            key={event.id}
            className={`p-5 rounded-xl bg-white/10 border ${isOfficial ? 'border-amber-500/30' : 'border-white/10'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white text-xl shrink-0`}>
                {event.category === 'fireworks' ? '🎆' :
                 event.category === 'parade' ? '🎉' :
                 event.category === 'games' ? '🎮' :
                 event.category === 'meetup' ? '👋' :
                 event.category === 'party' ? '🎊' :
                 event.category === 'contest' ? '🏆' : '📅'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-semibold text-white">{event.title}</h3>
                  {isOfficial && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium">
                      Official
                    </span>
                  )}
                  {!event.is_approved && event.creator_id === currentUserId && (
                    <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-xs">
                      Pending Approval
                    </span>
                  )}
                </div>
                <p className="text-purple-300 text-sm mt-1">
                  {formatDate(event.event_time)}
                  {event.location && ` • ${event.location}`}
                </p>
                {event.description && (
                  <p className="text-purple-200 text-sm mt-2">{event.description}</p>
                )}
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-purple-400 text-sm">
                    {goingCount} going
                  </span>
                  {event.is_approved && !isOfficial && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRsvp(event.id, 'going')}
                        disabled={loadingEventId === event.id || isPending}
                        className={`px-3 py-1 rounded-lg text-sm transition ${
                          userRsvp?.status === 'going'
                            ? 'bg-green-500 text-white'
                            : 'bg-white/10 text-purple-300 hover:bg-white/20'
                        }`}
                      >
                        Going
                      </button>
                      <button
                        onClick={() => handleRsvp(event.id, 'maybe')}
                        disabled={loadingEventId === event.id || isPending}
                        className={`px-3 py-1 rounded-lg text-sm transition ${
                          userRsvp?.status === 'maybe'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-white/10 text-purple-300 hover:bg-white/20'
                        }`}
                      >
                        Maybe
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
