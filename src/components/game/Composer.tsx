/**
 * The bottom bar of the play screen. What it shows depends on the phase:
 * an action box (exploration / your combat turn), a Roll call-to-action,
 * a waiting state, or the DM-is-writing state. Also drives the shared timer:
 * when the countdown reaches zero every client calls `tick`, and the server
 * (idempotent on turnSeq) advances the table once.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { runAction, useAction } from '@/lib/actions'
import { MAX_ACTION_CHARS } from '@/game/types'
import { fmtClock, useCountdown, useTable } from './TableContext'

function Quill() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 candle-flicker text-gold" aria-hidden>
      <path d="M20 2c-6 1-11 6-13 13l-2 7 2-1 2-5c6-1 10-6 11-14z M7 15c3-2 6-6 8-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function Composer() {
  const t = useTable()
  const { game, mine, characters, log, rolls, tableId, isHost, typing } = t
  const { run, pending } = useAction()
  const [text, setText] = useState('')
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const secondsLeft = useCountdown(game?.deadlineAt || undefined)

  // Shared timer: when it hits zero, ask the server to move on.
  const tickedSeq = useRef<number | null>(null)
  useEffect(() => {
    if (!game || !game.deadlineAt) return
    if (!['exploration', 'combat', 'rolls'].includes(game.phase)) return
    if (secondsLeft > 0 || tickedSeq.current === game.turnSeq) return
    tickedSeq.current = game.turnSeq
    void runAction('tick', { tableId, turnSeq: game.turnSeq })
  }, [secondsLeft, game, tableId])

  const roundActions = useMemo(
    () => (game ? log.filter((l) => l.data.kind === 'action' && l.data.round === game.round && !(l.data.data as { combat?: boolean }).combat) : []),
    [log, game],
  )
  if (!game) return null

  const living = characters.filter((c) => c.data.hp > 0)
  const actedIds = new Set(roundActions.map((a) => a.data.characterId))
  const iActed = mine ? actedIds.has(mine.recordId) : false
  const currentId = game.combat.active && game.combat.turnIndex >= 0 ? game.combat.order[game.combat.turnIndex]?.id : null
  const current = characters.find((c) => c.recordId === currentId)
  const myTurn = game.phase === 'combat' && !!mine && currentId === mine.recordId
  const myPendingRoll = rolls.find((r) => r.data.status === 'requested' && r.data.userId === t.userId)
  const pendingRollers = rolls.filter((r) => r.data.status === 'requested').map((r) => characters.find((c) => c.recordId === r.data.characterId)?.data.name ?? '?')
  const typingNames = characters.filter((c) => c.data.userId !== t.userId && typing.has(c.data.userId)).map((c) => c.data.name)

  const canAct = !!mine && mine.data.hp > 0 && ((game.phase === 'exploration' && !iActed) || myTurn)

  const submit = async (pass: boolean) => {
    const out = await run('submitAction', { tableId, text: pass ? '' : text, pass })
    if (out.success) {
      setText('')
      t.setTyping(false)
    }
  }

  const onChange = (v: string) => {
    setText(v)
    t.setTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => t.setTyping(false), 2500)
  }

  let status: React.ReactNode = null
  if (game.phase === 'exploration') {
    status = (
      <>
        Round {game.round} · {actedIds.size} of {living.length} ready
        {iActed && living.length > actedIds.size && (
          <> · waiting for {living.filter((c) => !actedIds.has(c.recordId)).map((c) => c.data.name).join(', ')}</>
        )}
      </>
    )
  } else if (game.phase === 'combat') {
    status = myTurn ? <>Your turn, {mine?.data.name}</> : <>{current?.data.name ?? 'Someone'}&apos;s turn</>
  } else if (game.phase === 'rolls') {
    status = <>Waiting on dice: {pendingRollers.join(', ')}</>
  }

  return (
    <div className="border-t border-border bg-leather px-4 py-3" data-testid="composer">
      {game.phase === 'dm' ? (
        <div className="flex items-center gap-3 py-2 text-muted-foreground" data-testid="dm-status" data-status={game.dmStatus}>
          {game.dmStatus === 'error' ? (
            <>
              <span className="text-destructive">The Dungeon Master stumbled.</span>
              {isHost ? (
                <Button size="sm" variant="outline" loading={pending === 'retryDm'} onClick={() => run('retryDm', { tableId })}>
                  Ask them to try again
                </Button>
              ) : (
                <span>Waiting for the host to retry.</span>
              )}
            </>
          ) : (
            <>
              <Quill />
              <span className="font-display text-lg italic">{game.dmStatus === 'narrating' ? 'The Dungeon Master is writing…' : 'The Dungeon Master is thinking…'}</span>
            </>
          )}
        </div>
      ) : game.phase === 'rolls' && myPendingRoll ? (
        <div className="flex flex-wrap items-center gap-3 py-1">
          <span className="font-display text-lg">The DM asks you to roll: <strong className="text-gold">{myPendingRoll.data.label}</strong></span>
          <Button
            data-testid="composer-roll"
            className="bg-oxblood text-parchment hover:bg-oxblood"
            loading={pending === 'rollDice'}
            onClick={() => run('rollDice', { tableId, rollId: myPendingRoll.recordId })}
          >
            Roll the d20
          </Button>
          <Timer seconds={secondsLeft} />
        </div>
      ) : canAct ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) void submit(false)
          }}
        >
          <div className="flex-1">
            <label htmlFor="action-input" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              {myTurn ? `Your turn: what does ${mine?.data.name} do?` : `What does ${mine?.data.name} do?`}
            </label>
            <Textarea
              id="action-input"
              data-testid="action-input"
              value={text}
              maxLength={MAX_ACTION_CHARS}
              rows={2}
              placeholder={myTurn ? 'I swing my longsword at the ghoul…' : 'I ask the miller when he last saw Elsie…'}
              className="resize-none bg-background font-serif text-base"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (text.trim()) void submit(false)
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" data-testid="act-button" disabled={!text.trim()} loading={pending === 'submitAction'}>
              Act
            </Button>
            <Button type="button" variant="outline" data-testid="pass-button" disabled={pending === 'submitAction'} onClick={() => submit(true)}>
              {myTurn ? 'Dodge' : 'Pass'}
            </Button>
            <Timer seconds={secondsLeft} />
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3 py-2 text-muted-foreground">
          <span>{mine && mine.data.hp <= 0 ? `${mine.data.name} is unconscious. Your allies can still save you.` : !mine ? 'You are watching this tale.' : 'Your action is in.'}</span>
          <Timer seconds={secondsLeft} />
        </div>
      )}

      <div className="mt-1 flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-testid="round-status">{status}</span>
        <span className="flex items-center gap-3">
          {typingNames.length > 0 && <span className="italic">{typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} writing…</span>}
          {isHost && ['exploration', 'combat', 'rolls'].includes(game.phase) && (
            <button className="underline-offset-2 hover:text-foreground hover:underline" onClick={() => run('hostAdvance', { tableId })}>
              Skip waiting
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

function Timer({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null
  return (
    <span className={cn('min-w-10 text-right font-mono text-sm tabular-nums', seconds <= 10 ? 'text-destructive' : 'text-muted-foreground')} aria-label={`${seconds} seconds left`}>
      {fmtClock(seconds)}
    </span>
  )
}
