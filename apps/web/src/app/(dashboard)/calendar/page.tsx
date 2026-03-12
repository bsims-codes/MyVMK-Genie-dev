import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventsList } from './events-list'
import { CreateEventForm } from './create-event-form'
import { fetchOfficialEvents } from '@/lib/ics-parser'

const ICS_URL = 'https://bsims-codes.github.io/myvmk-ics/myvmk.ics'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch both official (ICS) and player events in parallel
  const [officialEvents, { data: playerEvents }] = await Promise.all([
    fetchOfficialEvents(ICS_URL),
    supabase
      .from('events')
      .select(`
        *,
        event_rsvps (
          user_id,
          status
        )
      `)
      .or(`is_approved.eq.true,creator_id.eq.${user.id}`)
      .gte('event_time', new Date().toISOString())
      .order('event_time', { ascending: true })
  ])

  // Filter official events to only show upcoming
  const now = new Date()
  const upcomingOfficialEvents = officialEvents
    .filter(e => e.start >= now)
    .map(e => ({
      id: e.id,
      title: e.title,
      description: e.description || null,
      event_time: e.start.toISOString(),
      end_time: e.end?.toISOString() || null,
      location: e.location || null,
      category: 'official',
      is_approved: true,
      is_official: true,
      creator_id: null,
      event_rsvps: []
    }))

  // Mark player events
  const markedPlayerEvents = (playerEvents || []).map(e => ({
    ...e,
    is_official: false
  }))

  // Combine and sort by date
  const allEvents = [...upcomingOfficialEvents, ...markedPlayerEvents]
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())

  const officialCount = upcomingOfficialEvents.length
  const playerCount = markedPlayerEvents.length

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
            <h1 className="text-2xl font-bold text-white">Events Calendar</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200 mb-4">
            Browse upcoming MyVMK events - official game events and community-created events!
          </p>
          {/* Legend */}
          <div className="flex gap-6 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span className="text-purple-200">Official Events ({officialCount})</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              <span className="text-purple-200">Community Events ({playerCount})</span>
            </span>
          </div>
        </div>

        {/* Create Event Form */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Create Community Event</h2>
          <CreateEventForm userId={user.id} />
        </div>

        {/* Events List */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Upcoming Events ({allEvents.length})
          </h2>
          <EventsList events={allEvents} currentUserId={user.id} />
        </div>
      </main>
    </div>
  )
}
