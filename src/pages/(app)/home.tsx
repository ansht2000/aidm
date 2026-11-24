/**
 * The tavern board (lobby): create a table, join by code, see your tables,
 * open public tables, and past chronicles.
 */

import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthOverlay, useAuth, useQuery } from 'deepspace'
import { Button, Input, Switch, buttonVariants } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAction } from '@/lib/actions'
import { MODULES, DEFAULT_MODULE_ID } from '@/game/content/modules'
import { MAX_SEATS, type TableData } from '@/game/types'
import { SceneArt } from '@/components/game/SceneArt'

type Rec = { recordId: string; data: TableData; createdAt: string }

function TableRow({ t, cta }: { t: Rec; cta: string }) {
  const d = t.data
  return (
    <li className="flex items-center gap-4 rounded-md border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xl font-semibold">{d.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {d.moduleTitle} · host {d.hostName} · {d.playerIds.length}/{MAX_SEATS} seats
          {d.status === 'playing' && ' · in progress'}
          {d.visibility === 'private' && ' · invite only'}
        </p>
      </div>
      <Link to={`/t/${d.code}`} className={buttonVariants({ variant: cta === 'Join' ? 'default' : 'outline', size: 'sm' })} data-testid={`table-link-${d.code}`}>
        {cta}
      </Link>
    </li>
  )
}

export default function HomePage() {
  const { isSignedIn, isLoaded, userId } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  // Local dev/test only: `?fakeDm=1` asks for a scripted DM. The server ignores
  // it unless ALLOW_DEBUG_ROUTES is on, which production never sets.
  const fakeDm = search.get('fakeDm') === '1'
  const { run, pending } = useAction()
  const [name, setName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [code, setCode] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const { records, status } = useQuery<TableData>('tables', { orderBy: 'createdAt', orderDir: 'desc', limit: 100 })
  const tables = records as Rec[]

  const mine = tables.filter((t) => userId && t.data.playerIds.includes(userId))
  const active = mine.filter((t) => t.data.status !== 'ended')
  const past = mine.filter((t) => t.data.status === 'ended' && t.data.recap)
  const open = tables.filter(
    (t) => t.data.status === 'lobby' && t.data.visibility === 'public' && !(userId && t.data.playerIds.includes(userId)) && t.data.playerIds.length < MAX_SEATS,
  )
  const module = MODULES[DEFAULT_MODULE_ID]

  const create = async () => {
    const out = await run<{ code: string }>('createTable', { name: name.trim() || undefined, visibility: isPublic ? 'public' : 'private', moduleId: DEFAULT_MODULE_ID, fakeDm })
    if (out.success && out.data) navigate(`/t/${out.data.code}`)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="relative overflow-hidden rounded-md border border-border">
        <SceneArt type="tavern" className="absolute inset-0" />
        <div className="relative z-10 grid gap-6 bg-gradient-to-r from-background via-background/85 to-background/20 p-6 sm:p-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Tonight&apos;s tale</p>
            <h1 className="mt-1 font-display text-4xl font-semibold sm:text-5xl">{module.title}</h1>
            <p className="mt-3 max-w-lg font-serif text-lg text-muted-foreground">{module.pitch}</p>
            <p className="mt-3 text-sm text-muted-foreground">1–5 players · about 25 minutes · an AI Dungeon Master runs the table</p>
          </div>

          {!isLoaded ? null : !isSignedIn ? (
            <div className="flex flex-col justify-center gap-3 rounded-md border border-border bg-card/90 p-5">
              <p className="font-display text-xl">Sign in to host or join a table</p>
              <Button onClick={() => setShowAuth(true)} data-testid="home-sign-in">
                Sign in
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-md border border-border bg-card/90 p-5">
              <div>
                <label htmlFor="table-name" className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
                  Host a new table
                </label>
                <Input id="table-name" placeholder="The Lantern Company" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  List it on the tavern board
                  <span className="block text-xs text-muted-foreground">{isPublic ? 'Anyone signed in can join' : 'Only people with the invite code'}</span>
                </span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="List publicly" />
              </label>
              <Button data-testid="create-table" loading={pending === 'createTable'} onClick={create}>
                Light the lantern and host
              </Button>
              <form
                className="flex gap-2 border-t border-border pt-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  const c = code.trim().toUpperCase()
                  if (c) navigate(`/t/${c}`)
                }}
              >
                <Input aria-label="Invite code" placeholder="Invite code" maxLength={6} className="font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} />
                <Button type="submit" variant="outline" disabled={code.trim().length !== 6}>
                  Join
                </Button>
              </form>
            </div>
          )}
        </div>
      </section>

      {isSignedIn && (
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-2xl">Your tables</h2>
            {status === 'loading' ? (
              <p className="mt-3 text-sm text-muted-foreground">Reading the board…</p>
            ) : active.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No tables yet. Host one above, or join an open table.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {active.map((t) => (
                  <TableRow key={t.recordId} t={t} cta={t.data.status === 'playing' ? 'Return' : 'Open'} />
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="font-display text-2xl">Open tables</h2>
            {status === 'loading' ? null : open.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nobody is gathering right now. Host a table and send the invite link to friends.</p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="open-tables">
                {open.map((t) => (
                  <TableRow key={t.recordId} t={t} cta="Join" />
                ))}
              </ul>
            )}
          </section>
          {past.length > 0 && (
            <section className="lg:col-span-2">
              <h2 className="font-display text-2xl">Chronicles</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {past.map((t) => (
                  <li key={t.recordId}>
                    <Link to={`/t/${t.data.code}`} className={cn('block rounded-md p-5 parchment transition-transform hover:-translate-y-0.5')}>
                      <p className="rubric text-xs">{t.data.name} · {t.data.recap?.outcome === 'victory' ? 'victory' : t.data.recap?.outcome === 'defeat' ? 'defeat' : 'unfinished'}</p>
                      <p className="mt-1 font-display text-2xl font-semibold text-ink">{t.data.recap?.title}</p>
                      <p className="mt-2 line-clamp-3 font-serif text-ink-soft">{t.data.recap?.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </div>
  )
}
