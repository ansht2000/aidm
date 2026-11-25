/**
 * "Read aloud": asks the server for an ElevenLabs narration of a finished
 * passage and plays it. One clip plays at a time across the page, and clips
 * are kept for the visit so replaying a passage doesn't bill again.
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAction } from '@/lib/actions'
import { useTable } from './TableContext'

const clips = new Map<string, string>()
let current: { audio: HTMLAudioElement; key: string; stop: () => void } | null = null

function Speaker({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {playing ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
    </svg>
  )
}

export function ReadAloud({ logIds, className, label = 'Read aloud' }: { logIds: string[]; className?: string; label?: string }) {
  const { tableId } = useTable()
  const { run, pending } = useAction()
  const key = logIds.join(',')
  const [playing, setPlaying] = useState(false)

  // Stop when this passage's button goes away (new turn, view switch).
  useEffect(() => () => {
    if (current?.key === key) current.stop()
  }, [key])

  if (logIds.length === 0) return null

  const play = (url: string) => {
    current?.stop()
    const audio = new Audio(url)
    const stop = () => {
      audio.pause()
      setPlaying(false)
      if (current?.audio === audio) current = null
    }
    audio.onended = stop
    audio.onerror = stop
    current = { audio, key, stop }
    setPlaying(true)
    void audio.play().catch(stop)
  }

  const onClick = async () => {
    if (playing) return current?.stop()
    const cached = clips.get(key)
    if (cached) return play(cached)
    const out = await run<{ audioUrl: string }>('readAloud', { tableId, logIds })
    if (out.success && out.data?.audioUrl) {
      clips.set(key, out.data.audioUrl)
      play(out.data.audioUrl)
    }
  }

  const loading = pending === 'readAloud'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      data-testid="read-aloud"
      data-state={loading ? 'loading' : playing ? 'playing' : 'idle'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-sans text-xs text-ink-soft transition-colors hover:text-oxblood disabled:opacity-60',
        className,
      )}
    >
      <Speaker playing={playing} />
      {loading ? 'Finding the narrator…' : playing ? 'Stop' : label}
    </button>
  )
}
