/**
 * Scene-first "tabletop" view: the scene fills the screen, the current DM
 * passage is a caption card, the party sits along the bottom like seats at
 * a table, and the full story opens in a drawer. Same live data as the
 * story view, different presentation.
 */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { MODULES } from '@/game/content/modules'
import { healthBand } from '@/game/rules'
import { Composer } from './Composer'
import { HpBar, Sigil, SheetDialog } from './PartyRail'
import { RollCard } from './RollCard'
import { SceneArt } from './SceneArt'
import { StoryLog } from './StoryLog'
import { useTable } from './TableContext'

function renderInline(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
}

export function TabletopView({ toolbar }: { toolbar: React.ReactNode }) {
  const { game, log, rolls, characters, enemies, online, typing, userId } = useTable()
  const [drawer, setDrawer] = useState(false)
  const [sheet, setSheet] = useState<string | null>(null)

  const mod = game ? MODULES[game.moduleId] : undefined
  const scene = mod?.scenes.find((s) => s.id === game?.sceneId) ?? mod?.scenes[0]

  // The caption is the DM's latest turn: narration since the last player action.
  const { caption, streaming, recent } = useMemo(() => {
    const lastAction = [...log].reverse().find((l) => l.data.kind === 'action')
    const since = log.filter((l) => !lastAction || l.data.seq > lastAction.data.seq)
    let narr = since.filter((l) => l.data.kind === 'narration')
    if (narr.length === 0) narr = [...log].reverse().filter((l) => l.data.kind === 'narration').slice(0, 1)
    const recentSystem = since.filter((l) => l.data.kind === 'system' && (l.data.data as { type?: string }).type !== 'scene').slice(-3)
    return {
      caption: narr.map((n) => n.data.text).join('\n\n'),
      streaming: narr.some((n) => n.data.streaming),
      recent: recentSystem,
    }
  }, [log])
  const openRolls = rolls.filter((r) => r.data.status === 'requested')
  const currentId = game?.combat.active ? game.combat.order[game.combat.turnIndex]?.id : null
  const foes = game?.combat.active ? enemies.filter((e) => e.data.status === 'active') : []
  const selected = characters.find((c) => c.recordId === sheet)

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="tabletop-view">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SceneArt type={scene?.type ?? 'marsh'} className="absolute inset-0" />
        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-background/90 to-transparent p-4">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">{mod?.title}</p>
            <h1 className="font-display text-3xl font-semibold text-parchment">{scene?.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {toolbar}
            <Button size="sm" variant="outline" onClick={() => setDrawer(true)}>
              Full story
            </Button>
          </div>
        </div>

        {foes.length > 0 && (
          <div className="absolute right-4 top-24 z-10 space-y-1.5">
            {foes.map((e) => (
              <div key={e.recordId} className={cn('rounded-sm border bg-background/80 px-3 py-1.5 text-sm backdrop-blur', currentId === e.recordId ? 'border-destructive' : 'border-border')}>
                <span className="text-destructive">{e.data.name}</span>
                <span className="ml-2 text-xs capitalize text-muted-foreground">{healthBand(e.data.hp, e.data.maxHp)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4">
          {recent.map((r) => (
            <p key={r.recordId} className="rounded-sm bg-background/75 px-3 py-1 text-center text-sm text-parchment backdrop-blur">
              {r.data.text}
            </p>
          ))}
          {openRolls.map((r) => (
            <div key={r.recordId} className="w-full max-w-md">
              <RollCard rollId={r.recordId} roll={r.data} />
            </div>
          ))}
          {caption && (
            <div className="parchment max-h-[38vh] w-full max-w-3xl overflow-y-auto rounded-md px-6 py-5 shadow-2xl" data-testid="tabletop-caption">
              {caption.split(/\n{2,}/).map((p, i, all) => (
                <p
                  key={i}
                  className={cn('narration mb-2 last:mb-0', streaming && i === all.length - 1 && 'quill-caret')}
                  dangerouslySetInnerHTML={{ __html: renderInline(p) }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-center gap-3 overflow-x-auto border-t border-border bg-leather px-4 py-3" aria-label="Seats at the table">
        {characters.map((c) => (
          <button
            key={c.recordId}
            onClick={() => setSheet(c.recordId)}
            className={cn(
              'flex w-40 shrink-0 flex-col items-center gap-1 rounded-md border bg-card px-3 py-2',
              currentId === c.recordId ? 'border-gold ring-1 ring-gold' : 'border-border',
              c.data.userId === userId && 'border-gold/60',
              c.data.hp <= 0 && 'opacity-60',
            )}
          >
            <Sigil name={c.data.name} sigil={c.data.sigil} className="h-12 w-12 text-2xl" />
            <span className="flex items-center gap-1 truncate font-display text-base font-semibold">
              {c.data.name.split(' ')[0]}
              <span className={cn('h-1.5 w-1.5 rounded-full', online.has(c.data.userId) ? 'bg-success' : 'bg-muted-foreground/40')} />
            </span>
            <HpBar hp={c.data.hp} maxHp={c.data.maxHp} />
            <span className="text-xs text-muted-foreground">{typing.has(c.data.userId) ? 'writing…' : `${c.data.hp}/${c.data.maxHp} HP`}</span>
          </button>
        ))}
      </div>
      <Composer />

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/60" onClick={() => setDrawer(false)}>
          <div className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-xl">The story so far</h2>
              <Button size="sm" variant="ghost" onClick={() => setDrawer(false)}>
                Close
              </Button>
            </div>
            <StoryLog className="min-h-0 flex-1" />
          </div>
        </div>
      )}
      {selected && <SheetDialog c={selected} onClose={() => setSheet(null)} />}
    </div>
  )
}
