import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PhotosGallery } from './photos-gallery'
import { UploadForm } from './upload-form'

export default async function PhotosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: screenshots } = await supabase
    .from('screenshots')
    .select('*')
    .eq('user_id', user.id)
    .order('captured_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-purple-300 hover:text-white transition"
            >
              &larr; Back
            </Link>
            <h1 className="text-2xl font-bold text-white">Screenshots</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <p className="text-purple-200">
            View and manage your MyVMK screenshots. Upload images or capture them using the browser extension.
          </p>
        </div>

        {/* Upload Form */}
        <div className="mb-8">
          <UploadForm userId={user.id} />
        </div>

        {/* Gallery */}
        <PhotosGallery screenshots={screenshots || []} />
      </main>
    </div>
  )
}
