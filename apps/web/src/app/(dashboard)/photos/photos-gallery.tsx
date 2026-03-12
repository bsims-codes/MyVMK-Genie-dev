'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Screenshot {
  id: string
  storage_path: string
  filename: string | null
  captured_at: string
}

interface PhotosGalleryProps {
  screenshots: Screenshot[]
}

export function PhotosGallery({ screenshots }: PhotosGalleryProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<Screenshot | null>(null)

  const supabase = createClient()

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('screenshots').getPublicUrl(path)
    return data.publicUrl
  }

  const handleDelete = async (screenshot: Screenshot) => {
    if (!confirm('Delete this screenshot?')) return

    setDeletingId(screenshot.id)

    const { error: storageError } = await supabase.storage
      .from('screenshots')
      .remove([screenshot.storage_path])

    if (storageError) {
      console.error('Storage delete error:', storageError)
    }

    const { error: dbError } = await supabase
      .from('screenshots')
      .delete()
      .eq('id', screenshot.id)

    if (dbError) {
      console.error('DB delete error:', dbError)
    }

    setDeletingId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  if (screenshots.length === 0) {
    return (
      <div className="p-12 rounded-xl bg-white/5 border border-white/10 text-center">
        <div className="text-4xl mb-4">🖼️</div>
        <p className="text-purple-300">No screenshots yet. Upload some above!</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {screenshots.map((screenshot) => (
          <div
            key={screenshot.id}
            className="group relative aspect-video rounded-xl overflow-hidden bg-white/10 border border-white/10"
          >
            <Image
              src={getPublicUrl(screenshot.storage_path)}
              alt={screenshot.filename || 'Screenshot'}
              fill
              className="object-cover cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setSelectedImage(screenshot)}
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
                <span className="text-white text-xs truncate max-w-[70%]">
                  {screenshot.filename || 'Screenshot'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(screenshot)
                  }}
                  disabled={deletingId === screenshot.id || isPending}
                  className="px-2 py-1 rounded bg-red-500/80 hover:bg-red-500 text-white text-xs transition disabled:opacity-50"
                >
                  {deletingId === screenshot.id ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full h-full">
            <Image
              src={getPublicUrl(selectedImage.storage_path)}
              alt={selectedImage.filename || 'Screenshot'}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 text-white text-2xl hover:text-purple-300 transition"
          >
            &times;
          </button>
        </div>
      )}
    </>
  )
}
