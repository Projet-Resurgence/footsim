# FootSim — Plan 3 : Match Engine & Live UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full match flow: pre-computed team ratings, tick-based simulation engine running in a Web Worker, live UI (scoreboard, mini-map SVG pitch, event feed, stats panel, speed controls, half-time overlay), match persistence in `BJBellum/footsim-data/data/matches/{id}.json`, and recent-matches history embedded in team metadata.

**Architecture:** Sim engine is a deterministic state machine that advances one simulated minute per tick. Engine and UI are decoupled via `postMessage` between a Web Worker and a Zustand `match` store. The pitch is rendered as an SVG `viewBox="0 0 100 50"` with player dots positioned by formation; the ball moves via Framer Motion tween. Speed levels (0.5×/1×/2×/5×/instant) are honored by the worker's `setInterval`; instant mode runs synchronously and yields one final state.

**Tech Stack:** React 18, Zustand, Framer Motion, Vite Web Worker, the player + team types from Plan 2, the GitHub store from Plans 1–2.

---

## File Structure (Plan 3)

```
src/
├── lib/sim/
│   ├── types.ts             # MatchEvent, MatchState, MatchInput, Speed, EventKind
│   ├── lineup.ts            # auto-pick best XI from roster + formation
│   ├── lineup.test.ts
│   ├── precompute.ts        # ratings + per-min probabilities
│   ├── precompute.test.ts
│   ├── engine.ts            # pure tick(state, ratings) → state
│   ├── engine.test.ts
│   ├── events.ts            # event templates + text builders
│   └── worker.ts            # Worker entry, drives ticks at speed
├── lib/github/matches.ts    # save match + append to team recentMatches
├── stores/match.ts          # Zustand match slice
├── components/match/
│   ├── Pitch.tsx
│   ├── Scoreboard.tsx
│   ├── EventFeed.tsx
│   ├── StatsPanel.tsx
│   ├── SpeedControls.tsx
│   └── HalftimeOverlay.tsx
└── pages/matches/
    ├── MatchSetup.tsx
    └── MatchLive.tsx
```

---

## Task 1 : Sim types

**Files:**
- Create: `src/lib/sim/types.ts`

- [ ] **Step 1: Create `src/lib/sim/types.ts`**

```ts
import type { Formation, Player, Team, Position } from '@/lib/types';

export type Speed = 'instant' | '0.5' | '1' | '2' | '5';

export type EventKind =
  | 'kickoff' | 'goal' | 'shot' | 'shotOnTarget' | 'save' | 'foul'
  | 'yellow' | 'red' | 'corner' | 'offside' | 'halftime' | 'fulltime' | 'keyPass';

export type MatchEvent = {
  id: number;
  minute: number;
  half: 1 | 2;
  type: EventKind;
  side: 'home' | 'away' | null;
  playerId?: string;
  text: string;
  ballPos?: { x: number; y: number };
};

export type SideRatings = {
  attack: number; midfield: number; defense: number; gk: number;
  formation: Formation;
  lineup: string[];      // player ids on pitch (length 11; updated when sent off)
  bench: string[];       // remaining roster
  yellow: Set<string>;
  red: Set<string>;
};

export type MatchInput = {
  matchId: string;
  home: { team: Team; players: Player[]; formation: Formation };
  away: { team: Team; players: Player[]; formation: Formation };
  speed: Speed;
};

export type MatchState = {
  matchId: string;
  status: 'pregame' | 'firstHalf' | 'halftime' | 'secondHalf' | 'fulltime';
  minute: number;
  half: 1 | 2;
  addedTime: number;             // for the current half
  score: { home: number; away: number };
  events: MatchEvent[];
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  fouls: { home: number; away: number };
  cards: { home: { yellow: string[]; red: string[] }; away: { yellow: string[]; red: string[] } };
  possession: { home: number; away: number };  // running %
  ball: { x: number; y: number };
  speed: Speed;
};

export type FormationLayout = Record<Position, number>;
