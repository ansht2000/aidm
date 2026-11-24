/** Pre-session: seats, hero picker, invite link, ready-up, host start. */

import { useEffect, useState } from 'react'
import { Button, Input, Textarea, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAction } from '@/lib/actions'
import { PREGENS, SIGILS } from '@/game/content/pregens'
import { MAX_SEATS, type Pregen } from '@/game/types'
import { HpBar, Sigil } from './PartyRail'
import { useTable } from './TableContext'

function PregenCard({ p, takenBy, selected, onPick }: { p: Pregen; takenBy: string | null; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!!takenBy}
      data-testid={`pregen-${p.id}`}
      className={cn(
        'flex flex-col gap-2 rounded-md border bg-card p-4 text-left transition-colors',
        selected ? 'border-gold ring-1 ring-gold' : 'border-border hover:border-gold',
        takenBy && 'cursor-not-allowed opacity-50 hover:border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <Sigil name={p.name} sigil={p.sigil} />
        <div>
          <p className="font-display text-xl font-semibold leading-tight">{p.className}</p>
          <p className="text-xs text-muted-foreground">{p.ancestry} · HP {p.maxHp} · AC {p.ac}</p>
        </div>
      </div>
      <p className="font-serif text-sm italic text-muted-foreground">{p.tagline}</p>
      {takenBy && <p className="text-xs text-gold">Taken by {takenBy}</p>}
    </button>
  )
}

export function TableLobby() {
  const { table, characters, mine, isHost, tableId, userId, nameOf, online } = useTable()
  const { run, pending } = useAction()
  const { success } = useToast()
  const [pick, setPick] = useState<string | null>(mine?.data.pregenId ?? null)
  const [name, setName] = useState(mine?.data.name ?? '')
  const [backstory, setBackstory] = useState(mine?.data.backstory ?? '')
  const [sigil, setSigil] = useState(mine?.data.sigil ?? '')

  // When a hero is first claimed, sync the form to the server copy.
  useEffect(() => {
    if (mine) {
      setPick(mine.data.pregenId)
      setName(mine.data.name)
      setBackstory(mine.data.backstory)
      setSigil(mine.data.sigil)
    }
  }, [mine?.recordId, mine?.data.pregenId])

  const chosen = PREGENS.find((p) => p.id === pick)
  const invite = typeof window !== 'undefined' ? `${window.location.origin}/t/${table.data.code}` : `/t/${table.data.code}`
  const allReady = characters.length > 0 && characters.every((c) => c.data.ready)
  const dirty = !!chosen && (!mine || mine.data.pregenId !== chosen.id || mine.data.name !== name || mine.data.backstory !== backstory || mine.data.sigil !== sigil)

  const choose = (p: Pregen) => {
    setPick(p.id)
    setName(p.name)
    setBackstory(p.backstory)
    setSigil(p.sigil)
  }

  const save = () => chosen && run('claimCharacter', { tableId, pregenId: chosen.id, name, backstory, sigil })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" data-testid="table-lobby">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">{table.data.moduleTitle}</p>
          <h1 className="font-display text-4xl font-semibold">{table.data.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hosted by {table.data.hostName} · {table.data.visibility === 'public' ? 'Listed on the tavern board' : 'Invite only'} · about 25 minutes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">Invite code </span>
            <span className="font-mono text-lg tracking-widest text-gold" data-testid="invite-code">
              {table.data.code}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(invite)
              success('Invite link copied', invite)
            }}
          >
            Copy invite link
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="font-display text-2xl">Choose your hero</h2>
          <p className="text-sm text-muted-foreground">Six level-3 adventurers. Rename them and make them yours.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PREGENS.map((p) => {
              const taken = characters.find((c) => c.data.pregenId === p.id && c.data.userId !== userId)
              return <PregenCard key={p.id} p={p} takenBy={taken ? taken.data.name : null} selected={pick === p.id} onPick={() => choose(p)} />
            })}
          </div>

          {chosen && (
            <div className="mt-6 rounded-md border border-border bg-card p-5" data-testid="hero-form">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground" htmlFor="hero-name">
                    Name
                  </label>
                  <Input id="hero-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <span className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Sigil colour</span>
                  <div className="flex gap-1.5">
                    {SIGILS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-label={s}
                        onClick={() => setSigil(s)}
                        className={cn('sigil-badge h-8 w-8 rounded-sm', `sigil-${s}`, sigil === s && 'outline outline-2 outline-offset-2 outline-gold')}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <label className="mb-1 mt-4 block text-xs uppercase tracking-wider text-muted-foreground" htmlFor="hero-story">
                One line of backstory (the DM will use it)
              </label>
              <Textarea id="hero-story" value={backstory} maxLength={240} rows={2} className="font-serif" onChange={(e) => setBackstory(e.target.value)} />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button data-testid="claim-hero" onClick={save} disabled={!dirty} loading={pending === 'claimCharacter'}>
                  {mine ? 'Save changes' : `Play as ${name || chosen.name}`}
                </Button>
                {mine && !dirty && (
                  <Button
                    data-testid="ready-toggle"
                    variant={mine.data.ready ? 'outline' : 'default'}
                    loading={pending === 'setReady'}
                    onClick={() => run('setReady', { tableId, ready: !mine.data.ready })}
                  >
                    {mine.data.ready ? 'Not ready yet' : "I'm ready"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        <aside>
          <h2 className="font-display text-2xl">
            Seats <span className="text-muted-foreground">{table.data.playerIds.length}/{MAX_SEATS}</span>
          </h2>
          <ul className="mt-3 space-y-2" data-testid="seats">
            {table.data.playerIds.map((pid) => {
              const c = characters.find((x) => x.data.userId === pid)
              return (
                <li key={pid} className="rounded-md border border-border bg-card p-3">
                  <div className="flex items-center gap-3">
                    {c ? <Sigil name={c.data.name} sigil={c.data.sigil} className="h-9 w-9 text-lg" /> : <span className="h-9 w-9 rounded-sm border border-dashed border-border" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {c ? c.data.name : 'Choosing a hero…'}
                        {pid === table.data.hostId && <span className="ml-1.5 text-xs text-gold">host</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {nameOf(pid)}
                        {c && ` · ${c.data.className}`}
                      </p>
                    </div>
                    <span className={cn('h-2 w-2 rounded-full', online.has(pid) ? 'bg-success' : 'bg-muted-foreground/40')} />
                    {c?.data.ready && <span className="text-xs font-semibold text-success">Ready</span>}
                  </div>
                  {c && (
                    <div className="mt-2">
                      <HpBar hp={c.data.hp} maxHp={c.data.maxHp} />
                    </div>
                  )}
                </li>
              )
            })}
            {Array.from({ length: MAX_SEATS - table.data.playerIds.length }, (_, i) => (
              <li key={`open-${i}`} className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                Open seat
              </li>
            ))}
          </ul>

          <div className="mt-5">
            {isHost ? (
              <>
                <Button
                  className="w-full"
                  size="lg"
                  data-testid="start-session"
                  disabled={!allReady}
                  loading={pending === 'startGame'}
                  onClick={() => run('startGame', { tableId })}
                >
                  Begin the tale
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {allReady ? 'Everyone with a hero is ready.' : 'Starts when every hero is marked ready.'}
                </p>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground">The host begins the tale once everyone is ready.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
