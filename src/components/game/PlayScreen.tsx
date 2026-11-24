/** The in-session screen: scene banner, story log, composer, party rail. */

import { useState } from 'react'
import { ConfirmModal, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAction } from '@/lib/actions'
import { SESSION_TARGET_MIN } from '@/game/types'
import { Composer } from './Composer'
import { PartyRail, PartyStrip } from './PartyRail'
import { SceneArt } from './SceneArt'
import { StoryLog } from './StoryLog'
import { TabletopView } from './TabletopView'
import { useCountdown, useTable } from './TableContext'

type View = 'story' | 'tabletop'
const VIEW_KEY = 'inkbound:view'

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'tabletop' ? 'tabletop' : 'story'
  } catch {
    return 'story'
  }
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const base = 'px-2.5 py-1 text-xs transition-colors'
  return (
    <div className="flex overflow-hidden rounded-sm border border-border bg-background/70 backdrop-blur" role="group" aria-label="Table view">
      <button className={cn(base, view === 'story' ? 'bg-gold text-primary-foreground' : 'text-parchment-deep hover:text-parchment')} aria-pressed={view === 'story'} onClick={() => onChange('story')}>
        Story
      </button>
      <Tooltip>
        <TooltipTrigger
          data-testid="tabletop-toggle"
          className={cn(base, view === 'tabletop' ? 'bg-gold text-primary-foreground' : 'text-parchment-deep hover:text-parchment')}
          aria-pressed={view === 'tabletop'}
          onClick={() => onChange('tabletop')}
        >
          Tabletop
        </TooltipTrigger>
        <TooltipContent>More cinematic, but harder to read long narration.</TooltipContent>
      </Tooltip>
    </div>
  )
}

function useElapsedMinutes(startedAt: number) {
  // Re-render every 15 s; countdown hook ticks while a deadline is set.
  useCountdown(startedAt ? startedAt + 3_600_000 : undefined)
  return startedAt ? Math.floor((Date.now() - startedAt) / 60000) : 0
}

function SceneBanner({ toolbar }: { toolbar: React.ReactNode }) {
  const { game, table, isHost, tableId, module: mod } = useTable()
  const { run } = useAction()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const elapsed = useElapsedMinutes(game?.startedAt ?? 0)
  if (!game) return null
  const idx = Math.max(0, mod?.scenes.findIndex((s) => s.id === game.sceneId) ?? 0)
  const scene = mod?.scenes[idx]
  return (
    <header className="relative h-36 shrink-0 overflow-hidden border-b border-border sm:h-44" data-testid="scene-banner">
      <SceneArt type={scene?.type ?? 'marsh'} className="absolute inset-0" />
      <div className="absolute inset-0 z-10 flex flex-col justify-end bg-gradient-to-t from-background via-background/30 to-transparent p-4 sm:p-5">
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">
          {mod?.title} · Part {idx + 1} of {mod?.scenes.length ?? 4}
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold leading-tight text-parchment sm:text-4xl">{scene?.title}</h1>
          <div className="flex shrink-0 items-center gap-3 text-xs text-parchment-deep">
            <span className={cn('font-mono tabular-nums', elapsed >= SESSION_TARGET_MIN && 'text-destructive')} title="Session time">
              {elapsed} / ~{SESSION_TARGET_MIN} min
            </span>
            <span className="hidden sm:inline">{table.data.name}</span>
            {toolbar}
            {isHost && game.phase !== 'ended' && (
              <button className="underline-offset-2 hover:text-parchment hover:underline" onClick={() => setConfirmEnd(true)}>
                End session
              </button>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false)
          void run('endGame', { tableId })
        }}
        title="End the session now?"
        description="The Dungeon Master will write the chronicle of what happened so far."
        confirmText="End and write the chronicle"
      />
    </header>
  )
}

function InitiativeBar() {
  const { game, characters, enemies } = useTable()
  if (!game?.combat.active) return null
  const isDown = (id: string) => {
    const c = characters.find((x) => x.recordId === id)
    if (c) return c.data.hp <= 0
    const e = enemies.find((x) => x.recordId === id)
    return !e || e.data.status !== 'active'
  }
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border bg-card px-4 py-2 text-xs" aria-label="Initiative order">
      <span className="mr-1 shrink-0 font-display uppercase tracking-widest text-destructive">Round {game.combat.round}</span>
      {game.combat.order.map((c, i) => (
        <span
          key={c.id}
          className={cn(
            'shrink-0 rounded-sm border px-2 py-0.5',
            i === game.combat.turnIndex && game.phase !== 'dm' ? 'border-gold bg-gold text-primary-foreground' : 'border-border',
            c.kind === 'enemy' && i !== game.combat.turnIndex && 'text-destructive',
            isDown(c.id) && 'line-through opacity-50',
          )}
        >
          {c.name} <span className="opacity-70">{c.init}</span>
        </span>
      ))}
    </div>
  )
}

export function PlayScreen() {
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* per-viewer convenience only */
    }
  }
  const toggle = <ViewToggle view={view} onChange={setView} />
  if (view === 'tabletop') {
    return (
      <div className="h-full min-h-0" data-testid="play-screen">
        <TabletopView toolbar={toggle} />
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" data-testid="play-screen">
      <div className="flex min-h-0 flex-1 flex-col">
        <SceneBanner toolbar={toggle} />
        <div className="shrink-0 border-b border-border bg-shell lg:hidden">
          <PartyStrip />
        </div>
        <StoryLog className="min-h-0 flex-1" />
        <InitiativeBar />
        <Composer />
      </div>
      <div className="hidden shrink-0 border-l border-border bg-shell lg:block lg:w-80">
        <PartyRail />
      </div>
    </div>
  )
}
