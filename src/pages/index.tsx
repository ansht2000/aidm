/**
 * Landing page — STATIC (prerendered; no DeepSpace providers).
 *
 * DESIGN DIRECTION
 * - Who: friends who want a real tabletop session tonight without a human DM
 *   or an hour of prep. Some have never played.
 * - Feeling: opening an old, well-loved book by candlelight. Eerie but warm.
 * - Signature: a live CSS scene (fog, reeds, a drowned bell tower) behind an
 *   illuminated title with a drop cap; story text set on parchment.
 * - Type: Cormorant Garamond display, EB Garamond for story, Alegreya Sans UI.
 * - Colour: ink and leather chrome, parchment pages, gold leaf, oxblood rubric.
 * - Voice: an innkeeper telling you about tonight's trouble. Plain, specific,
 *   never salesy.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { SceneArt } from '../components/game/SceneArt'
import { ADVENTURE_SETTINGS, ADVENTURE_TONES } from '../game/types'
import { seo } from '../seo'

const STEPS = [
  {
    n: 'I',
    title: 'Light a table',
    body: 'Host a table and send the invite link, or join an open one from the tavern board. Up to five players.',
  },
  {
    n: 'II',
    title: 'Take up a hero',
    body: 'Six ready-made level-3 adventurers. Rename one, give them a line of backstory, and mark yourself ready.',
  },
  {
    n: 'III',
    title: 'Play the night through',
    body: 'Everyone declares what they do each round. The Dungeon Master narrates live, asks for rolls, and runs the fights in initiative order.',
  },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <section className="relative flex min-h-[78vh] items-end overflow-hidden border-b border-border">
          <SceneArt type="marsh" className="absolute inset-0" />
          <div className="relative z-10 w-full bg-gradient-to-t from-background via-background/70 to-transparent">
            <div className="mx-auto max-w-5xl px-6 pb-14 pt-40">
              <p className="font-display text-sm uppercase tracking-[0.35em] text-gold">Inkbound</p>
              <h1 className="mt-3 max-w-3xl font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
                The bell is tolling. Gather your party.
              </h1>
              <p className="mt-5 max-w-xl font-serif text-xl text-muted-foreground">
                An AI Dungeon Master runs a 25-minute fantasy adventure for you and up to four friends: live narration, real dice, real stakes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/home"
                  className="inline-flex h-11 items-center rounded-md bg-primary px-6 font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  data-testid="enter-app"
                >
                  Enter the tavern
                </Link>
                <span className="text-sm text-muted-foreground">Free to play · sign in with Google</span>
              </div>
            </div>
          </div>
        </section>

        <section className="parchment">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="rubric text-sm">Tonight&apos;s tale</p>
              <h2 className="mt-1 font-display text-4xl font-semibold text-ink">The Bell Beneath the Marsh</h2>
              <p className="narration dropcap mt-5">
                For three nights a drowned chapel has rung its bell across the fens of Saltmere, and each night someone walks into the fog and does not come back. Tonight it took the miller&apos;s daughter. The tavern has gone quiet, and every face has turned to you.
              </p>
            </div>
            <ol className="space-y-6 self-center">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="rubric w-8 shrink-0 text-right text-2xl">{s.n}</span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold text-ink">{s.title}</h3>
                    <p className="font-serif text-lg text-ink-soft">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14" data-testid="landing-new-tale">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-1">
              <h2 className="font-display text-3xl font-semibold">A new tale every night</h2>
            </div>
            <div className="md:col-span-2">
              <p className="font-serif text-lg text-muted-foreground">
                Play <em>The Bell Beneath the Marsh</em>, or ask the Dungeon Master for a tale nobody has played before. Choose the tone and where it happens, and it is written in about a minute, while your party picks their heroes.
              </p>
              <dl className="mt-6 space-y-4">
                {[
                  { label: 'Tone', options: ADVENTURE_TONES },
                  { label: 'Setting', options: ADVENTURE_SETTINGS },
                ].map((row) => (
                  <div key={row.label}>
                    <dt className="mb-2 font-display text-xs uppercase tracking-[0.3em] text-gold">{row.label}</dt>
                    <dd className="flex flex-wrap gap-2">
                      {row.options.map((o) => (
                        <span key={o} className="rounded-sm border border-border px-2.5 py-0.5 font-serif text-base capitalize text-foreground/90">
                          {o}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-sm text-muted-foreground">Each host can have two new tales written a day.</p>
            </div>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
            <span>Inkbound · 5e-compatible. Includes material from the System Reference Document 5.1 by Wizards of the Coast, licensed under CC-BY-4.0.</span>
            <Link to="/home" className="hover:text-foreground">
              Tavern board
            </Link>
          </div>
        </footer>
      </div>
    </>
  )
}
