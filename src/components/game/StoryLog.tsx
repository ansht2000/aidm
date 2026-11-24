/**
 * The story feed on a parchment page: DM narration (with drop caps and a
 * quill caret while it streams), player actions as margin notes, dice and
 * damage as small rubricated lines, scene changes as headings.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtMod } from '@/game/rules'
import type { LogData, RollData } from '@/game/types'
import { RollCard } from './RollCard'
import { useTable } from './TableContext'

type Item =
  | { kind: 'log'; seq: number; id: string; data: LogData }
  | { kind: 'roll'; seq: number; id: string; data: RollData }

function Narration({ text, streaming, dropcap }: { text: string; streaming: boolean; dropcap: boolean }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean)
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className={cn(
            'narration whitespace-pre-line',
            dropcap && i === 0 && p.length > 60 && 'dropcap',
            streaming && i === paragraphs.length - 1 && 'quill-caret',
          )}
          dangerouslySetInnerHTML={{ __html: renderInline(p) }}
        />
      ))}
    </div>
  )
}

/** Escape HTML, then allow *italics* only. */
function renderInline(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\*\*/g, '')
}

function SystemLine({ entry }: { entry: LogData }) {
  const d = entry.data as { type?: string; rolls?: number[]; dice?: string; natural?: number; hit?: boolean }
  if (d.type === 'scene') {
    return (
      <div className="pt-4 pb-1 text-center">
        <div className="fleuron text-xs">
          <span aria-hidden>&#10087;</span>
        </div>
        <h3 className="rubric mt-1 text-2xl">{entry.text}</h3>
      </div>
    )
  }
  const dice =
    d.type === 'enemy-attack' && typeof d.natural === 'number'
      ? `d20: ${d.natural}`
      : d.rolls && d.rolls.length
        ? `${d.dice ?? ''} [${d.rolls.map((r) => Math.abs(r)).join(', ')}]`
        : ''
  const tone =
    d.type === 'dm-error'
      ? 'text-oxblood'
      : d.type === 'damage' || (d.type === 'enemy-attack' && d.hit)
        ? 'text-oxblood'
        : d.type === 'heal'
          ? 'text-sigil-fern'
          : 'text-ink-soft'
  return (
    <p className={cn('flex flex-wrap items-baseline justify-center gap-x-2 text-center font-sans text-[0.9rem]', tone)}>
      <span>{entry.text}</span>
      {dice && <span className="font-mono text-xs text-ink-faint">{dice}</span>}
    </p>
  )
}

function ActionNote({ entry }: { entry: LogData }) {
  const { characters } = useTable()
  const c = characters.find((x) => x.recordId === entry.characterId)
  const meta = entry.data as { pass?: boolean; timeout?: boolean }
  const name = c?.data.name ?? 'Someone'
  return (
    <div className={cn('rise-in border-l-2 pl-3', `sigil-${c?.data.sigil ?? 'slate'}`, 'sigil-rule')}>
      <span className="rubric sigil-text text-sm font-semibold">{name}</span>
      {meta.pass ? (
        <p className="font-serif italic text-ink-soft">{meta.timeout ? 'hesitates, and keeps their guard up.' : 'waits and watches.'}</p>
      ) : (
        <p className="font-serif text-[1.05rem] italic text-ink">{entry.text}</p>
      )}
    </div>
  )
}

export function StoryLog({ className }: { className?: string }) {
  const { log, rolls } = useTable()
  const scroller = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...log.filter((l) => l.data.kind !== 'recap').map((l) => ({ kind: 'log' as const, seq: l.data.seq, id: l.recordId, data: l.data })),
      ...rolls.map((r) => ({ kind: 'roll' as const, seq: r.data.seq, id: r.recordId, data: r.data })),
    ]
    return all.sort((a, b) => a.seq - b.seq)
  }, [log, rolls])

  const lastText = items.length ? JSON.stringify(items[items.length - 1].data).length + items.length : 0
  useEffect(() => {
    const el = scroller.current
    if (el && pinned) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [lastText, pinned])

  let lastNarrationWasDropcap = false
  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget
        setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
      }}
      className={cn('parchment overflow-y-auto', className)}
      data-testid="story-log"
      aria-live="polite"
    >
      <div className="mx-auto max-w-[44rem] space-y-5 px-5 py-8 sm:px-10">
        {items.length === 0 && <p className="narration text-center italic text-ink-soft">The page is blank. The tale begins when the host starts the session.</p>}
        {items.map((item) => {
          if (item.kind === 'roll') {
            if (item.data.status !== 'requested') lastNarrationWasDropcap = false
            return <RollCard key={item.id} rollId={item.id} roll={item.data} />
          }
          const e = item.data
          if (e.kind === 'narration') {
            const drop = !lastNarrationWasDropcap
            lastNarrationWasDropcap = true
            return (
              <div key={item.id} className="rise-in" data-testid="narration">
                <Narration text={e.text} streaming={e.streaming} dropcap={drop} />
              </div>
            )
          }
          // A drop cap opens each DM turn: reset after player actions and scene
          // headings, but not after the dice lines woven through a turn.
          if (e.kind === 'action') {
            lastNarrationWasDropcap = false
            return <ActionNote key={item.id} entry={e} />
          }
          if ((e.data as { type?: string })?.type === 'scene') lastNarrationWasDropcap = false
          return <SystemLine key={item.id} entry={e} />
        })}
      </div>
    </div>
  )
}

export { fmtMod }
