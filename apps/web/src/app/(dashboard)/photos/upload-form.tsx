'use client'

import { useState, useTransition, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface UploadFormProps {
  userId: string
}

export function UploadForm({ userId }: UploadFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setError('')
    setIsUploading(true)
    const supabase = createClient()

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed')
        continue
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(fileName, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        setError('Failed to upload image. Make sure the screenshots bucket exists.')
        continue
      }

      const { error: dbError } = await supabase
        .from('screenshots')
        .insert({
          user_id: userId,
          storage_path: fileName,
          filename: file.name,
        })

      if (dbError) {
        console.error('DB error:', dbError)
      }
    }

    setIsUploading(false)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`p-8 rounded-xl border-2 border-dashed transition-colors ${
        dragActive
          ? 'border-purple-400 bg-purple-500/20'
          : 'border-white/20 bg-white/5 hover:border-white/30'
      }`}
    >
      <div className="text-center">
        <div className="text-4xl mb-4">📸</div>
        <p className="text-white font-medium mb-2">
          {isUploading ? 'Uploading...' : 'Drop screenshots here'}
        </p>
        <p className="text-purple-300 text-sm mb-4">or</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading || isPending}
          className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
        >
          Browse Files
        </button>
        {error && (
          <p className="text-red-400 text-sm mt-4">{error}</p>
        )}
      </div>
    </div>
  )
}
