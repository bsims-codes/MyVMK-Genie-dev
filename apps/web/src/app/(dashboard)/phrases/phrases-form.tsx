'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Phrase {
  id: string
  slot: number
  content: string
}

interface PhrasesFormProps {
  initialPhrases: Phrase[]
  userId: string
}

export function PhrasesForm({ initialPhrases, userId }: PhrasesFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [phrases, setPhrases] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {}
    for (let i = 1; i <= 10; i++) {
      const existing = initialPhrases.find(p => p.slot === i)
      map[i] = existing?.content || ''
    }
    return map
  })
  const [savedMessage, setSavedMessage] = useState('')

  const handleSave = async () => {
    const supabase = createClient()

    const updates = Object.entries(phrases).map(([slot, content]) => ({
      user_id: userId,
      slot: parseInt(slot),
      content,
    }))

    const { error } = await supabase
      .from('phrases')
      .upsert(updates, { onConflict: 'user_id,slot' })

    if (error) {
      console.error('Error saving phrases:', error)
      setSavedMessage('Error saving phrases')
    } else {
      setSavedMessage('Phrases saved!')
      startTransition(() => {
        router.refresh()
      })
    }

    setTimeout(() => setSavedMessage(''), 3000)
  }

  const hotkeyLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

  return (
    <div className="space-y-4">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((slot) => (
        <div
          key={slot}
          className="flex items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/10"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold shrink-0">
            {hotkeyLabels[slot - 1]}
          </div>
          <input
            type="text"
            value={phrases[slot]}
            onChange={(e) => setPhrases(prev => ({ ...prev, [slot]: e.target.value }))}
            placeholder={`Phrase for hotkey ${hotkeyLabels[slot - 1]}...`}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/20 text-white placeholder:text-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            maxLength={200}
          />
        </div>
      ))}

      <div className="flex items-center justify-between pt-4">
        <p className="text-purple-200 text-sm">
          {savedMessage || 'Changes are not saved automatically'}
        </p>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium transition"
        >
          {isPending ? 'Saving...' : 'Save Phrases'}
        </button>
      </div>
    </div>
  )
}
