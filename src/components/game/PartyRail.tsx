/** Party cards (HP, AC, conditions, presence), enemies, and the sheet dialog. */

import { useState } from 'react'
import { Badge, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { abilityMod, fmtMod, healthBand, rollModifier } from '@/game/rules'
import { ABILITIES, SKILLS, type CharacterData, type EnemyData, type Skill } from '@/game/types'
import { useTable } from './TableContext'

type Rec<T> = { recordId: string; data: T }

export function Sigil({ name, sigil, className }: { name: string; sigil: string; className?: string }) {
  return (
    <span className={cn('sigil-badge grid shrink-0 place-items-center rounded-sm', `sigil-${sigil}`, className ?? 'h-10 w-10 text-xl')} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  return (
    <div className="hp-track h-1.5 w-full overflow-hidden rounded-full" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={maxHp} aria-label="Hit points">
      <div className={cn('hp-fill h-full', pct > 50 && 'healthy')} style={{ width: `${pct}%` }} />
    </div>
  )
}

function CharacterCard({ c, onOpen }: { c: Rec<CharacterData>; onOpen: () => void }) {
  const { online, typing, userId, game, log } = useTable()
  const d = c.data
  const isOnline = online.has(d.userId)
  const isMine = d.userId === userId
  const acted =
    game?.phase === 'exploration' &&
    log.some((l) => l.data.kind === 'action' && l.data.round === game.round && l.data.characterId === c.recordId && !(l.data.data as { combat?: boolean }).combat)
  const theirTurn = game?.combat.active && game.combat.order[game.combat.turnIndex]?.id === c.recordId && game.phase === 'combat'
  return (
    <button
      onClick={onOpen}
      data-testid="party-card"
      className={cn(
        'w-full rounded-md border bg-card p-3 text-left transition-colors hover:border-gold',
        isMine ? 'border-gold/60' : 'border-border',
        theirTurn && 'ring-1 ring-gold',
        d.hp <= 0 && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-3">
        <Sigil name={d.name} sigil={d.sigil} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-lg font-semibold leading-tight">{d.name}</span>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', isOnline ? 'bg-success' : 'bg-muted-foreground/40')} title={isOnline ? 'Online' : 'Away'} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {d.ancestry} {d.className} · AC {d.ac}
          </p>
        </div>
        <div className="text-right font-mono text-sm tabular-nums">
          {d.hp}
          <span className="text-muted-foreground">/{d.maxHp}</span>
        </div>
      </div>
      <div className="mt-2">
        <HpBar hp={d.hp} maxHp={d.maxHp} />
      </div>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1">
        {d.conditions.map((cond) => (
          <Badge key={cond} variant="destructive" className="px-1.5 py-0 text-[0.65rem] capitalize">
            {cond}
          </Badge>
        ))}
        {theirTurn && <span className="text-xs font-semibold text-gold">Their turn</span>}
        {acted && <span className="text-xs text-success">Action in</span>}
        {!acted && typing.has(d.userId) && <span className="text-xs italic text-muted-foreground">writing…</span>}
      </div>
    </button>
  )
}

function EnemyRow({ e }: { e: Rec<EnemyData> }) {
  const band = healthBand(e.data.hp, e.data.maxHp)
  const { game } = useTable()
  const theirTurn = game?.combat.order[game.combat.turnIndex]?.id === e.recordId
  return (
    <li className={cn('flex items-center justify-between gap-2 rounded-sm border border-border px-2.5 py-1.5 text-sm', theirTurn && 'border-destructive')}>
      <span className={cn('truncate', e.data.status !== 'active' && 'line-through opacity-60')}>{e.data.name}</span>
      <span className={cn('shrink-0 text-xs capitalize', band === 'unhurt' ? 'text-muted-foreground' : 'text-destructive')}>
        {e.data.status === 'fled' ? 'fled' : band}
      </span>
    </li>
  )
}

export function PartyRail() {
  const { characters, enemies, game } = useTable()
  const [open, setOpen] = useState<string | null>(null)
  const selected = characters.find((c) => c.recordId === open)
  const activeEnemies = enemies.filter((e) => e.data.status !== 'fled' || game?.combat.active)
  return (
    <aside className="flex flex-col gap-4 overflow-y-auto p-4" aria-label="Party">
      <section>
        <h2 className="mb-2 font-display text-sm uppercase tracking-[0.2em] text-gold">The party</h2>
        <div className="space-y-2">
          {characters.map((c) => (
            <CharacterCard key={c.recordId} c={c} onOpen={() => setOpen(c.recordId)} />
          ))}
        </div>
      </section>
      {game?.combat.active && activeEnemies.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-sm uppercase tracking-[0.2em] text-destructive">Foes</h2>
          <ul className="space-y-1.5">
            {activeEnemies.map((e) => (
              <EnemyRow key={e.recordId} e={e} />
            ))}
          </ul>
        </section>
      )}
      {selected && <SheetDialog c={selected} onClose={() => setOpen(null)} />}
    </aside>
  )
}

export function SheetDialog({ c, onClose }: { c: Rec<CharacterData>; onClose: () => void }) {
  const d = c.data
  return (
    <Modal open onClose={onClose} size="lg" aria-label={`${d.name} character sheet`}>
      <div className="max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center gap-4">
          <Sigil name={d.name} sigil={d.sigil} className="h-14 w-14 text-3xl" />
          <div>
            <h2 className="font-display text-3xl font-semibold">{d.name}</h2>
            <p className="text-sm text-muted-foreground">
              {d.ancestry} {d.className}, level {d.level} · HP {d.hp}/{d.maxHp} · AC {d.ac} · Speed {d.speed} ft
            </p>
          </div>
        </div>
        <p className="mt-3 font-serif italic text-muted-foreground">{d.backstory}</p>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITIES.map((a) => (
            <div key={a} className="rounded-sm border border-border p-2 text-center">
              <div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">{a}</div>
              <div className="font-display text-2xl">{fmtMod(abilityMod(d.abilities[a]))}</div>
              <div className="text-xs text-muted-foreground">{d.abilities[a]}{d.skills.saves.includes(a) ? ' · save' : ''}</div>
            </div>
          ))}
        </div>

        <h3 className="mt-5 font-display text-lg text-gold">Attacks</h3>
        <ul className="mt-1 space-y-1 text-sm">
          {d.attacks.map((a) => {
            const dmgMod = a.addMod ? abilityMod(d.abilities[a.ability]) : 0
            return (
              <li key={a.name}>
                <strong>{a.name}</strong>{' '}
                {a.save ? `${a.save.toUpperCase()} save DC 13` : `${fmtMod(rollModifier(d, 'attack', a.name) ?? 0)} to hit`}, {a.damage}
                {dmgMod ? fmtMod(dmgMod) : ''} {a.damageType}
                {a.note && <span className="text-muted-foreground"> ({a.note})</span>}
              </li>
            )
          })}
        </ul>

        <h3 className="mt-4 font-display text-lg text-gold">Features and magic</h3>
        <ul className="mt-1 space-y-1.5 text-sm">
          {d.features.map((f) => (
            <li key={f.name}>
              <strong>{f.name}</strong>
              {f.maxUses !== undefined && <span className="ml-1 font-mono text-xs text-gold">{f.uses}/{f.maxUses}</span>}
              <span className="text-muted-foreground"> {f.text}</span>
            </li>
          ))}
        </ul>

        <h3 className="mt-4 font-display text-lg text-gold">Skills</h3>
        <div className="mt-1 grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-3">
          {(Object.keys(SKILLS) as Skill[]).map((s) => (
            <div key={s} className={cn('flex justify-between capitalize', d.skills.skills.includes(s) ? 'text-foreground' : 'text-muted-foreground')}>
              <span>{s}</span>
              <span className="font-mono">{fmtMod(rollModifier(d, 'skill', s) ?? 0)}</span>
            </div>
          ))}
        </div>

        <h3 className="mt-4 font-display text-lg text-gold">Pack</h3>
        <p className="text-sm text-muted-foreground">{d.inventory.join(' · ')}</p>
      </div>
    </Modal>
  )
}
