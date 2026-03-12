import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const features = [
    {
      title: 'Game Accounts',
      description: 'Manage your MyVMK accounts with secure storage and quick login',
      href: '/accounts',
      icon: '👤',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Quick Phrases',
      description: 'Set up hotkey-triggered messages for fast communication',
      href: '/phrases',
      icon: '💬',
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Screenshots',
      description: 'View and manage your captured game screenshots',
      href: '/photos',
      icon: '📸',
      color: 'from-orange-500 to-red-500',
    },
    {
      title: 'Room Audio',
      description: 'Customize background music for different game rooms',
      href: '/audio',
      icon: '🎵',
      color: 'from-green-500 to-teal-500',
    },
    {
      title: 'Events Calendar',
      description: 'Browse and RSVP to community events',
      href: '/calendar',
      icon: '📅',
      color: 'from-indigo-500 to-purple-500',
    },
    {
      title: 'Looking for Game',
      description: 'Find other players to join games with',
      href: '/lfg',
      icon: '🎮',
      color: 'from-pink-500 to-rose-500',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">MyVMK Genie</h1>
            <div className="flex items-center gap-4">
              <span className="text-purple-200 text-sm">{user.email}</span>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-purple-300 hover:text-white text-sm transition"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Welcome back!</h2>
          <p className="text-purple-200">Choose a feature to get started</p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Link
              key={feature.href}
              href={feature.href}
              className="group block p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 hover:border-white/20 transition-all duration-200"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-purple-200 text-sm">{feature.description}</p>
            </Link>
          ))}
        </div>

        {/* Extension Prompt */}
        <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🧩</div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Get the Browser Extension</h3>
              <p className="text-purple-200 mb-4">
                Install the MyVMK Genie browser extension for hotkey support, in-game screenshots, and more.
              </p>
              <button className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium transition">
                Install Extension
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
