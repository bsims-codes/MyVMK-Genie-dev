import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center">
            <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6">
              MyVMK <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Pal</span>
            </h1>
            <p className="text-xl lg:text-2xl text-purple-200 max-w-2xl mx-auto mb-8">
              Your ultimate companion for MyVMK. Manage accounts, send quick phrases,
              capture screenshots, and connect with the community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-lg hover:from-purple-500 hover:to-indigo-500 transition-all hover:scale-105"
              >
                Get Started Free
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-lg hover:bg-white/20 transition-all"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">Everything you need</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: '👤',
              title: 'Multi-Account Manager',
              description: 'Securely store and quickly switch between multiple MyVMK accounts',
            },
            {
              icon: '💬',
              title: 'Quick Phrases',
              description: 'Send preset messages with customizable hotkeys while playing',
            },
            {
              icon: '📸',
              title: 'Screenshot Gallery',
              description: 'Capture, organize, and share your favorite in-game moments',
            },
            {
              icon: '🎵',
              title: 'Room Audio',
              description: 'Set custom background music for different game rooms',
            },
            {
              icon: '📅',
              title: 'Events Calendar',
              description: 'Never miss a community event with ICS calendar integration',
            },
            {
              icon: '🎮',
              title: 'Looking for Game',
              description: 'Find other players in real-time to join games together',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-purple-200">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center p-12 rounded-3xl bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to enhance your MyVMK experience?</h2>
          <p className="text-purple-200 mb-8 max-w-xl mx-auto">
            Join the community and get access to all features completely free.
          </p>
          <Link
            href="/register"
            className="inline-block px-8 py-4 rounded-xl bg-white text-purple-900 font-semibold text-lg hover:bg-purple-100 transition-all"
          >
            Create Free Account
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-purple-300/60 text-sm">
          <p>MyVMK Genie is a community-made companion tool. Not affiliated with MyVMK.</p>
        </div>
      </footer>
    </div>
  )
}
