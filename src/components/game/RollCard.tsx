/** A requested or resolved die roll, shown inline in the story. */

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAction } from '@/lib/actions'
import { fmtMod } from '@/game/rules'
import type { RollData } from '@/game/types'
import { useTable } from './TableContext'

export function RollCard({ rollId, roll }: { rollId: string; roll: RollData }) {
  const { characters, userId, tableId, game } = useTable()
  const { run, pending } = useAction()
  const c = characters.find((x) => x.recordId === roll.characterId)
  const mine = roll.userId === userId
  const requested = roll.status === 'requested'

  // Animate only when the result arrives while we're watching.
  const wasRequested = useRef(requested)
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    if (wasRequested.current && !requested) setAnimate(true)
    wasRequested.current = requested
  }, [requested])

  const natural = roll.natural.length === 2 ? (roll.mode === 'adv' ? Math.max(...roll.natural) : Math.min(...roll.natural)) : roll.natural[0]
  const modeLabel = roll.mode === 'adv' ? 'with advantage' : roll.mode === 'dis' ? 'with disadvantage' : ''

  return (
    <div
      data-testid="roll-card"
      data-status={roll.status}
      className={cn(
        'rise-in mx-auto flex max-w-md items-center gap-4 rounded-md border border-parchment-edge bg-parchment-deep px-4 py-3',
        `sigil-${c?.data.sigil ?? 'slate'}`,
      )}
    >
      <div
        className={cn(
          'd20 shrink-0',
          requested && 'waiting',
          animate && 'rolling',
          natural === 20 && 'crit',
          natural === 1 && 'fumble',
        )}
        aria-hidden
      >
        {requested ? '?' : natural}
      </div>
      <div className="min-w-0 flex-1 font-sans text-ink">
        <p className="text-sm">
          <span className="rubric sigil-text font-semibold">{c?.data.name ?? 'Someone'}</span>
          <span className="text-ink-soft"> · {roll.label}</span>
          {modeLabel && <span className="text-ink-faint"> {modeLabel}</span>}
        </p>
        <p className="truncate text-xs text-ink-soft">{roll.reason}</p>
        {!requested && (
          <p className="mt-0.5 text-sm">
            <span className="font-mono">
              {roll.natural.join(' / ')} {fmtMod(roll.modifier)} = <strong>{roll.total}</strong>
            </span>
            <span className={cn('ml-2 rubric font-semibold', roll.success ? 'text-sigil-fern' : 'text-oxblood')}>
              {roll.success ? 'Success' : 'Failure'}
            </span>
            {roll.status === 'auto' && <span className="ml-2 text-xs text-ink-faint">(rolled for them)</span>}
          </p>
        )}
      </div>
      {requested && mine && game?.phase === 'rolls' && (
        <Button
          data-testid="roll-button"
          size="sm"
          className="shrink-0 bg-oxblood text-parchment hover:bg-oxblood"
          loading={pending === 'rollDice'}
          onClick={() => run('rollDice', { tableId, rollId })}
        >
          Roll {fmtMod(roll.modifier)}
        </Button>
      )}
      {requested && !mine && <span className="shrink-0 text-xs italic text-ink-faint">rolling…</span>}
    </div>
  )
}
