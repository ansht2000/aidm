/**
 * Hand-built scene illustrations: layered gradients (game.css) plus SVG
 * silhouettes and a little ambient motion. Deterministic (no randomness) so
 * the static landing page can prerender it.
 */

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import type { SceneType } from '@/game/types'

type Vars = CSSProperties & Record<`--${string}`, string>

function Embers({ count = 9 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="ember"
          style={{ left: `${12 + ((i * 37) % 70)}%`, bottom: `${8 + ((i * 13) % 20)}%`, '--dur': `${5 + (i % 4)}s`, '--delay': `${(i * 0.7) % 5}s`, '--dx': `${((i % 3) - 1) * 24}px` } as Vars}
        />
      ))}
    </div>
  )
}

function Wisps({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="s-glow">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="wisp"
          style={{ left: `${15 + ((i * 23) % 65)}%`, top: `${40 + ((i * 17) % 30)}%`, '--dur': `${7 + i * 2}s`, '--delay': `${i * 1.3}s`, '--dx': `${(i % 2 ? -1 : 1) * (20 + i * 8)}px`, '--dy': `${-6 - i * 3}px` } as Vars}
        />
      ))}
    </div>
  )
}

function Drips({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="drip" style={{ left: `${10 + ((i * 29) % 80)}%`, top: '8%', '--dur': `${2.4 + (i % 3) * 0.8}s`, '--delay': `${(i * 0.9) % 3}s` } as Vars} />
      ))}
    </div>
  )
}

function Tavern() {
  return (
    <>
      <svg className="s-window" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect x="250" y="22" width="70" height="78" rx="2" fill="currentColor" opacity="0.8" />
        <path d="M285 22v78M250 61h70" stroke="#140c07" strokeWidth="4" />
      </svg>
      <div className="rain-layer" style={{ clipPath: 'inset(14% 20% 37% 62.5%)' }} aria-hidden />
      <svg className="s-silhouette" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 0h400v14H0z M40 14h8v34h-8z M180 14h6v22h-6z" fill="currentColor" />
        <g className="s-glow candle-flicker">
          <circle cx="183" cy="44" r="9" fill="currentColor" opacity="0.9" />
          <circle cx="183" cy="44" r="26" fill="currentColor" opacity="0.18" />
        </g>
        <path d="M0 160V118h60l6-12h48l6 12h40v42z M150 160v-30h100v30z M260 160v-44h22v-16h44v16h74v44z" fill="currentColor" />
        <path d="M70 106c4-14 18-20 28-12 8-16 26-12 28 2v10H70z M300 100c2-12 14-16 22-8 6-10 18-8 20 2v6h-42z" fill="currentColor" />
      </svg>
      <Embers />
    </>
  )
}

function Marsh() {
  return (
    <>
      <svg className="s-far" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M296 112V54l9-14 9 14v58z" fill="currentColor" />
        <path d="M300 62h10v10h-10z" fill="#1b2220" />
        <path d="M0 120c60-8 120-6 180 0s140 6 220-4v44H0z" fill="currentColor" opacity="0.7" />
      </svg>
      <div className="fog-layer slow" aria-hidden />
      <Wisps />
      <svg className="s-silhouette" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path
          d="M0 160v-22c20-2 30 0 44 4l4-46 3 46 6-60 4 60 8-34 2 36c30 4 60 2 90-4l6-40 3 40 7-58 3 60c40-2 80 2 120 6l5-44 3 44 6-30 2 32c30 0 60-4 84-8v38z"
          fill="currentColor"
        />
        <path d="M120 150h170l6-6H114z" fill="currentColor" opacity="0.9" />
      </svg>
      <div className="fog-layer" aria-hidden />
    </>
  )
}

function Ruins() {
  return (
    <>
      <svg className="s-far" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M30 130l8-70 22-18 22 18 6 70z M320 128l6-60 18-14 18 14 4 60z" fill="currentColor" />
      </svg>
      <div className="rain-layer" aria-hidden />
      <svg className="s-silhouette" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g transform="rotate(-4 200 120)">
          <path d="M120 126V64c0-28 22-44 40-44s40 16 40 44v62h-16V68c0-16-10-28-24-28s-24 12-24 28v58z" fill="currentColor" />
          <path d="M210 126V40l20-30 20 30v86z" fill="currentColor" />
          <rect x="223" y="38" width="14" height="16" fill="#252d38" />
          <path d="M229 54v60" stroke="#525e6c" strokeWidth="1.2" />
          <path d="M260 126V84c0-14 10-22 20-22s20 8 20 22v42h-10V88c0-8-4-14-10-14s-10 6-10 14v38z" fill="currentColor" />
        </g>
        <path d="M0 128c70 4 140-2 210 0s130 6 190-2v34H0z" fill="currentColor" opacity="0.85" />
        <path d="M60 140h80M180 146h90M290 138h60" stroke="#55657a" strokeWidth="1" opacity="0.5" />
      </svg>
    </>
  )
}

function Crypt() {
  return (
    <>
      <svg className="s-far" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 0h400v160H0z M20 160V70c0-30 30-50 60-50s60 20 60 50v90z M140 160V70c0-30 30-50 60-50s60 20 60 50v90z M260 160V70c0-30 30-50 60-50s60 20 60 50v90z" fill="currentColor" fillRule="evenodd" />
      </svg>
      <svg className="s-silhouette" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <path d="M0 0h400v18H0z" fill="currentColor" />
        <path d="M198 18v62" stroke="currentColor" strokeWidth="2" />
        <path d="M168 120h64v-18h-64z" fill="currentColor" />
        <g className="s-glow candle-flicker">
          <circle cx="90" cy="118" r="4" fill="currentColor" />
          <circle cx="90" cy="118" r="18" fill="currentColor" opacity="0.2" />
          <circle cx="310" cy="114" r="4" fill="currentColor" />
          <circle cx="310" cy="114" r="18" fill="currentColor" opacity="0.2" />
          <circle cx="200" cy="96" r="3" fill="currentColor" />
          <circle cx="200" cy="96" r="14" fill="currentColor" opacity="0.2" />
        </g>
        <path d="M0 126c60 4 120-2 200 0s140 4 200-2v36H0z" fill="currentColor" opacity="0.92" />
        <path d="M40 138h60M150 144h110M300 136h70" stroke="#2c6b4f" strokeWidth="1" opacity="0.6" />
      </svg>
      <Drips />
    </>
  )
}

const SCENES: Record<SceneType, () => React.ReactElement> = { tavern: Tavern, marsh: Marsh, ruins: Ruins, crypt: Crypt }

export function SceneArt({ type, className }: { type: SceneType; className?: string }) {
  const Scene = SCENES[type] ?? Marsh
  return (
    <div className={cn('scene', `scene-${type}`, className)} role="img" aria-label={`${type} scene`}>
      <Scene />
      <div className="scene-vignette" aria-hidden />
    </div>
  )
}
