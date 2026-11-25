# Inkbound — an AI Dungeon Master for 1–5 players

**Live:** https://aidm.app.space · **Stack:** DeepSpace SDK 0.44 (Cloudflare Workers, Durable Objects), React 19 + Vite, Hono, Vercel AI SDK 7, Claude Haiku 5.5 through the DeepSpace AI proxy.

Inkbound runs a short (~25 minute) 5e-compatible fantasy adventure for a group of friends in the browser. One player hosts a table and shares an invite link (or lists it on the public tavern board). Everyone picks a ready-made hero, and an AI Dungeon Master narrates live while the group plays. The narration streams onto every player's screen at once. Players declare actions, roll dice when the DM asks, and fight in initiative order. At the end, the DM writes a chronicle of what happened.

## How to try it (2 minutes)

1. Open https://aidm.app.space → **Enter the tavern** → sign in with Google.
2. **Host a new table**. Keep *The Bell Beneath the Marsh*, or pick *A new one, written by the DM*.
3. **Copy invite link** and open it in a second browser or profile with another account (a solo game also works).
4. Each player picks a hero, presses **Play as…**, then **I'm ready**. The host presses **Begin the tale**.
5. Type what your hero does and press **Act**. When the DM asks for a roll, press **Roll the d20**. Use **Story / Tabletop** in the scene header to switch views. **End session** writes the chronicle at any time.

## Architecture

```
Browser ──WS──► AppRecordRoom "app:<id>"      users, tables (lobby index), quota
        ──WS──► AppRecordRoom "table:<id>"    game, adventure, characters, enemies, log, rolls   (seated players only)
        ──WS──► AppPresenceRoom "table:<id>"  who is online, who is typing                      (seated players only)
        ─POST─► /api/actions/:name            every player move; validates seat/host/turn, then writes
                    └─ enqueueJob ─► AppJobRoom "table:<id>"   dm-turn · recap · write-adventure
                                        └─ streamDeepSpaceAgent (Haiku 5.5 + 12 game tools)
                                        └─ throttled writes into the table's log → broadcast to all players
```

- **One RecordRoom per table** keeps each game's data and broadcasts isolated. The app room holds only the lobby index. All game collections are read-only for clients; every write goes through a server action or the DM job.
- **One JobRoom per table** gives a free per-table turn lock: jobs in a room run one at a time, while different tables run in parallel. A DM turn also survives any player closing their tab. Every transition bumps `game.turnSeq`, and a queued job no-ops if the table has moved on, so duplicate enqueues are harmless.
- **Live narration:** the job streams model text into a `log` row, updating it every ~220 ms. Each tool call splits the narration, so dice results appear exactly where they happened in the story.
- **Code**
  - `src/game/`: rules, engine, content
  - `src/game/dm/`: prompt, tools, writer, run, generator
  - `src/actions/game-actions.ts`: server actions
  - `src/server/realtime-routes.ts`: socket gating
  - `src/components/game/`: UI

### The main tradeoff: the model narrates, the server owns the mechanics

The DM model decides *what happens in the fiction*. Deterministic server code decides *when things happen and what the numbers are*: rounds, timers, whose turn it is, initiative, every die (crypto RNG), HP, spell slots, items. The model can change game state **only** through 12 zod-validated, bounded tools (`request_rolls`, `damage`, `enemy_attack`, `start_combat`, `advance_scene`, `end_adventure`, …). Each tool returns the exact outcome, so the model narrates from facts.

- **What this buys:** fair, visible dice; HP that never drifts; multiplayer correctness (two players can't both "go next"); bounded cost per turn; and prompt injection that can at worst change one table's story.
- **What it costs:** improvisational freedom. The DM cannot invent a mechanic the tools don't express, rulings are simplified 5e, and the turn flow is fixed (gather-then-resolve rounds, initiative in combat). For a 25-minute group session, predictability mattered more than open-endedness.

A second tradeoff was the model. I started on Claude Opus 5.5 and measured about **$0.15 per DM turn** (free-tier rates), roughly $5 per session, which is a whole free-tier credit allowance. Claude Haiku 5.5 ran a 15-turn session including combat for about **$0.04**, at 4–11 s per turn, with reliable tool use. Opus prose was somewhat richer, but at a live table cost and latency won.

## Platform primitives used (and why), and what was left out

| Need | DeepSpace primitive | Why |
|---|---|---|
| Shared, permissioned game state | `RecordRoom` + collection schemas with RBAC, `uniqueOn`, `collaboratorsField`/`visibilityField` | Live sync with server-side permissions. Private tables are visible only to seated players (`read: 'shared'`). |
| Isolated per-game data | Extra RecordRoom scopes (`table:<id>`) + nested `<RecordScope>` | No cross-table reads, no giant shared collection. |
| Privileged, validated writes | Server actions | Players never write state directly; actions check seat, host and turn. |
| DM turns that outlive a request | `JobRoom` + `enqueueJob` | Durable, serialized per table, survives disconnects; no hand-rolled queue or lock. |
| LLM with tools | `streamDeepSpaceAgent` (application profile, `effort`, `maxToolCalls`) | Platform model catalog, owner billing, bounded tool loop; no API keys or secrets. |
| Online / typing indicators | `PresenceRoom` (`usePresenceRoom`) | Ephemeral, no persistence needed. |
| Auth | DeepSpace auth (Google sign-in), verified JWT on every socket and action | Required: signed-out connections are session-local, so they can't keep a character. |

**Integrations considered and not used:**
- **Image generation** (`gemini/generate-image`): each image takes 5–15 s and costs money every scene, for little gameplay value. Hand-built CSS/SVG scenes (tavern, marsh, ruins, crypt) set the mood instantly and cost nothing.
- **Text-to-speech** (ElevenLabs/OpenAI) and **LiveKit voice**: cut for cost and scope; they weren't part of the core loop.
- No third-party API keys are needed, so the app has **no secrets**.

## Security and cost controls

An independent review (a separate agent with a fresh context) ran against the backend. I fixed every finding that held up and pinned the important ones with tests.

- **Writes:** every game collection is client read-only (`create/update/delete: false`).
- **Actions:** each one re-checks seat, host and turn, because server-action tools run with per-record RBAC off.
- **Sockets:**
  - A `table:<id>` room or presence scope admits only users seated at that table. Room names are allow-listed, so clients can't create arbitrary Durable Objects.
  - The scaffold's unused Yjs, canvas, cron and jobs socket routes are removed.
- **The job queue refuses every socket**, so only server code can enqueue AI work.
- **Daily caps are atomic:** 3 tables and 2 AI-written adventures per user per day. Each claim takes a quota row whose `uniqueOn` tuple can only be created once, so parallel bursts can't beat the cap (tested: 10 parallel creates → at most 3 succeed).
- **Turn budget:** 80 DM turns per table, and every attempt counts, including failures and retries. Retries are bounded; past the budget, only the chronicle remains.
- **Bounds everywhere:** 90 s per turn, 500-character actions, at most 20 dice and damage ≤ 60 per tool call.
- **Prompt-injection hygiene:** player text (actions, names, backstories) is escaped and wrapped in `<player_action>`/`<player_note>` tags, and the system prompt treats it as in-fiction intent only. The tools can only touch the current table.
- **Integration proxy:** refuses any integration not explicitly listed, so no caller can spend the owner's credits through it.
- **No raw `users` rows** (which contain email) are returned by any action.

## Verification

- **Automated (`npx deepspace test run all`, 15 specs, green):**
  - the scaffold's smoke, API and collab specs;
  - a two-player end-to-end session with a scripted DM: invite link, hero pick, ready-up, start, streamed opening, actions, a requested roll seen by both players, tabletop view and its tooltip, second round, chronicle on both screens;
  - a non-seated player can't open a table;
  - actions require auth;
  - a non-seated player is refused all six game actions;
  - atomic daily cap under a 10-request burst.
- **Live, against the real model** (opt-in specs `tests/live-*.spec.ts`, `tests/deployed.spec.ts`):
  - a solo session through several turns and a recap;
  - a combat run with initiative, player attack rolls, enemy attacks, damage, and a scene change;
  - the adventure writer;
  - **on the deployed app:** a two-player round (desktop host, phone-sized guest) through to the chronicle, plus an AI-written adventure.
- **Measured:**
  - Haiku turns take 4–11 s; the opening is about 4 s.
  - The adventure writer takes 35–63 s (it retries once if the JSON is invalid, then falls back to the hand-written module).
  - A session costs about $0.04–0.10.

## Status

| | |
|---|---|
| **Built and verified** | Lobby (public board + invite codes), 6 pregenerated heroes with renaming, ready-up, gather-then-resolve rounds with a 90 s timer and auto-pass, DM-requested player rolls with auto-roll on timeout, combat in initiative order with enemy turns, HP/conditions/items/spell slots via tools, scene changes and pacing to ~25 min, live streaming narration, presence and typing, story view + tabletop view toggle (tooltip as specified), mobile layout, chronicle, AI-written adventures, cost caps, socket gating. |
| **Built, lightly verified** | Long multi-player combats (verified solo and in a 2-player round, not a full 5-player session); the DM-error state (hit for real during a credit outage; the retry button itself was not re-run afterwards); a stalled job being unstuck by a non-host. |
| **Not built (by decision or for time)** | Voice narration, AI images (decided against), out-of-character chat, spectators or joining after start, rejoining as a replacement player, death saves / positioning / opportunity attacks (rules are simplified 5e). |
| **Known edges** | Players can read the hidden adventure notes (module secrets reach the client) — spoiler risk only. Two simultaneous joins can drop one seat; a roll and a timer expiring at the same instant can re-roll once (last write wins). A player who leaves a table in the lobby keeps receiving updates until they reload (the socket gate runs at connect). Prompt caching through the proxy was not verified. |

## What the agent did

This was built with Claude Code (Claude Opus 5.5) in one working day.

- **Planning:** read the DeepSpace docs and SDK types and wrote the plan (`docs/PLAN.md`, kept out of git per DeepSpace guidance). It put product, UX and architecture decisions to the applicant in four batches, then a scope cut once the deadline was known.
- **Building:** wrote all the code (rules engine, DM tools and prompts, job runner, streaming writer, actions, socket gating, UI, CSS scenes, content), the tests, and the live specs.
- **Spikes before relying on things:** a real DM turn, real combat, and the adventure writer. These found and fixed: roll requests appearing above their narration; a CSS layer bug that hid the scene art; a stale-closure reload after joining; too many drop caps; double enemy attacks.
- **Cost:** measured Opus cost per turn and proposed the switch to Haiku.
- **Review:** ran an independent security review and fixed what it found (atomic caps, turn-budget accounting, end-during-turn, stuck tables, prompt escaping, integration proxy lockdown, unused sockets, one hero per table).
- **Shipping:** registered and deployed the app, created two `@deepspace.test` accounts for multi-user testing (with the applicant's permission), and ran live smokes on the deployed app.

## What the applicant decided, verified, and changed

*To be completed by the applicant.* Decisions they made during planning:
- Gameplay:
  - gather-then-resolve turns, with initiative combat kept in core;
  - 5e SRD-lite rules and pregenerated heroes;
  - both hand-written and AI-written adventures.
- UI:
  - story view by default, with a toggleable tabletop view and the tooltip wording;
  - the illuminated-manuscript look;
  - no AI images, no voice.
- Multiplayer: public lobby plus invite links; players roll when the DM asks.
- Architecture: per-table background jobs; the owner pays for AI, with caps; GitHub as source of truth.
- Scope: which items were stretch.
- Cost: the Opus → Haiku switch; added credits.
- Sign-in: Google only. The SDK's default sign-in card also offered GitHub, which suits developers rather than a group of friends playing D&D.

Personal verification and changes: _(fill in what you tested yourself on the live app and anything you changed)_.

---
Includes material from the System Reference Document 5.1 by Wizards of the Coast, licensed under CC-BY-4.0. "Inkbound" and *The Bell Beneath the Marsh* are original.
