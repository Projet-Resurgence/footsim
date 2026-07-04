# CLAUDE.md — FootSim

## Project

FootSim — SPA simulating football matches between countries from "Projet Résurgence". Admin: Discord ID `772821169664426025`. Served at `foot.projet-resurgence.fr` via Docker. Persistence: **PR_API** (primary, JWT auth) → GitHub Contents API (legacy fallback) → IndexedDB (offline fallback).

## PR_API Integration

- Auth: Discord implicit flow → `/footsim/auth/discord/exchange` → FootSim JWT stored in `footsim.prapi_token` (localStorage via Zustand persist)
- Backend selector: `prApiToken` present → PR_API; `githubPat` present → GitHub; else → IndexedDB
- New files: `src/lib/prapi/client.ts`, `teamBackend.ts`, `leagueBackend.ts`, `competitionBackend.ts`, `matchBackend.ts`
- New store: `src/stores/prApiToken.ts`
- Env var: `VITE_PR_API_URL` (required) — baked at Vite build time

## PR_API Routes (prefix `/footsim`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/footsim/auth/discord/exchange` | none | Discord token → FootSim JWT |
| GET | `/footsim/teams` | JWT | List all teams |
| GET | `/footsim/teams/:slug` | JWT | Team + players |
| PUT | `/footsim/teams/:slug` | JWT admin | Save team + players |
| DELETE | `/footsim/teams/:slug` | JWT admin | Delete team |
| POST | `/footsim/matches` | JWT admin | Save match |
| GET | `/footsim/matches/:id` | JWT | Load match |
| GET | `/footsim/leagues/:nationSlug` | JWT | List leagues |
| PUT | `/footsim/leagues/:id` | JWT admin | Save league |
| DELETE | `/footsim/leagues/:id` | JWT admin | Delete league |
| GET | `/footsim/competitions` | JWT | List competition summaries |
| GET | `/footsim/competitions/:id` | JWT | Load competition |
| PUT | `/footsim/competitions/:id` | JWT admin | Save competition |
| DELETE | `/footsim/competitions/:id` | JWT admin | Delete competition |

## DB Migration (after deploying PR_API changes)

```bash
docker compose exec pr-api alembic revision --autogenerate -m "footsim tables"
docker compose exec pr-api alembic upgrade head
```

## Docker

- Service: `footsim` (nginx static, port 80 internal)
- Nginx: `foot.projet-resurgence.fr` → `http://footsim:80`
- Build args: `VITE_DISCORD_CLIENT_ID`, `VITE_DISCORD_REDIRECT_URI`, `VITE_ADMIN_DISCORD_ID`, `VITE_PR_API_URL`
- Add to `.env`: `FOOTSIM_DISCORD_REDIRECT_URI`, `FOOTSIM_ADMIN_DISCORD_ID`, `FOOTSIM_PR_API_URL`

## Stack

- Vite 5 + React 18 + TypeScript
- React Router v6 (BrowserRouter, basename `/footsim`)
- Zustand (stores: `session`, `credentials`, `teams`, `match`)
- Tailwind CSS (class-based dark mode) + Framer Motion + shadcn-style primitives
- Vitest + Testing Library
- Web Workers: player generator + match engine

## Auth

Discord OAuth implicit flow, scope `identify`. Token in `localStorage.footsim.session`. Admin gate via Discord ID matched to `VITE_ADMIN_DISCORD_ID`.

GitHub PAT stored in `localStorage.footsim.github_pat`. Required scope: `repo`. Set in `/dashboard/settings`. Validated via `GET /user`.

## Layout

```
src/
├── lib/
│   ├── env.ts              # typed import.meta.env access (literal — Vite static replace)
│   ├── theme.ts            # day/night cycle (6h-19h day)
│   ├── slug.ts, rng.ts, cn.ts, types.ts
│   ├── auth/discord.ts     # implicit-flow URL + parser + admin check
│   ├── github/
│   │   ├── api.ts          # readJson/writeJson/listDir/deleteFile (UTF-8 base64)
│   │   ├── store.ts        # team CRUD on top of api
│   │   └── matches.ts      # save match + append recentMatches
│   ├── gen/
│   │   ├── names.ts        # import.meta.glob over data/names/*.json
│   │   ├── positions.ts, overall.ts, players.ts
│   │   └── worker.ts       # chunked generation worker
│   └── sim/
│       ├── types.ts, lineup.ts, precompute.ts
│       ├── engine.ts       # tick(state, ctx) — pure-ish
│       ├── events.ts       # text templates + zone coords
│       └── worker.ts       # speed-driven loop
├── data/names/{culture}.json     # 21 cultures bundled
├── stores/                # Zustand slices
├── components/
│   ├── ui/                # Button, Input, Spinner, Toast
│   ├── layout/            # DashboardLayout, Sidebar
│   ├── auth/RequireAdmin
│   ├── team/              # FlagUpload, TeamCard, RosterTable, PlayerEdit
│   └── match/             # Pitch, Scoreboard, EventFeed, StatsPanel, SpeedControls, HalftimeOverlay
└── pages/
    ├── Home, NoAccess, auth/Callback
    ├── dashboard/        # Dashboard, Teams, TeamNew, TeamDetail, Settings
    └── matches/          # MatchSetup, MatchLive
```

## Data model

`data/teams/{slug}/team.json` — Team metadata + `recentMatches` (max 20).
`data/teams/{slug}/players.json` — `Player[]`.
`data/matches/{id}.json` — full match record (lineups, events, side stats).

Team: id, slug, name, flag (data URL PNG 150×150), culture, globalStrength, formation, playerCount, createdAt/By, optional `archived`.

Player stats: technical (9), mental (7), physical (7), goalkeeping (6, only for GK). All ints 1–20. `overall` (1–100) is computed from position-weighted average.

Cultures: 21 bundled — francais, anglais, allemand, italien, espagnol, portugais, grec, hongrois, tcheque, polonais, russe, ukrainien, suedois, neerlandais, roumain, serbe, croate, turc, arabe, japonais, coreen.

## Commands

```bash
npm install        # node 20+
npm run dev        # http://localhost:5173/footsim/
npm run build      # tsc -b && vite build && cp dist/index.html dist/404.html
npm run preview    # serve dist/
npm test           # vitest run
```

## Build / deploy

- Vite `base: '/footsim/'`. Production build copies `dist/index.html` → `dist/404.html` for SPA fallback on Pages.
- GitHub Actions workflow in `.github/workflows/pages.yml` writes `.env.production` from inline values + secret-backed Discord client ID, builds, deploys to Pages.

## Env vars (production written in CI)

- `VITE_DISCORD_CLIENT_ID` — Discord application client ID (public).
- `VITE_DISCORD_REDIRECT_URI` — must match Discord Developer Portal redirect.
- `VITE_DATA_REPO` — `BJBellum/footsim-data`.
- `VITE_DATA_BRANCH` — `main`.
- `VITE_ADMIN_DISCORD_ID` — `772821169664426025`.

Access **always** via literal `import.meta.env.VITE_FOO`. Dynamic indexing breaks Vite's static replacement → undefined at runtime → `Missing env var` throw at module load → blank screen.

## Match engine

### Pre-computation (`sim/precompute.ts`)

Called once per side before kick-off. Takes `players[]`, `formation`, optional `customLineup` (11 IDs), optional `tacticStyle`.

- **Lineup**: uses `customLineup` if provided and valid (11 resolvable players), else `pickXI` auto-selects best 11 by position fit.
- **Bench**: top 12 remaining players by `overall` desc. Engine draws from these for auto-subs.
- **Ratings computed from lineup**:
  - `attack` = `0.7 × avg(top3 attackers overall) + 0.3 × avg(AM overall)` × `tacticMods.attackMult`
  - `midfield` = `avg(all mid overall)` × `tacticMods.midfieldMult`
  - `defense` = `0.8 × avg(defenders overall) + 0.2 × GK overall`
  - `gk` = GK `overall`

### Tactic styles (`TacticMods`)

| Style | shotFreqMult | midfieldMult | attackMult | foulRateMult | defenseMult |
|---|---|---|---|---|---|
| possession | 0.88 | 1.12 | 1.00 | 1.00 | 1.00 |
| contre-attaque | 1.08 | 0.92 | 1.10 | 1.00 | 1.00 |
| direct | 1.18 | 1.00 | 1.00 | 1.00 | 1.00 |
| pressing | 1.00 | 1.15 | 1.00 | 1.12 | 1.00 |
| ultra-defensif | 0.65 | 0.85 | 0.75 | 1.05 | 1.20 |
| gegenpressing | 1.10 | 1.18 | 1.05 | 1.20 | 1.00 |
| tiki-taka | 0.82 | 1.20 | 0.95 | 0.90 | 1.05 |
| long-ball | 1.15 | 0.80 | 1.15 | 1.05 | 0.95 |
| chaos | 1.30 | 0.95 | 1.10 | 1.35 | 0.90 |
| ailes | 1.10 | 0.90 | 1.12 | 0.95 | 1.00 |
| bloc-median | 0.90 | 1.05 | 0.92 | 1.12 | 1.12 |
| football-total | 1.05 | 1.10 | 1.08 | 0.95 | 0.92 |

### Matchups (`sim/matchup.ts`)

Cross-side layer applied in `worker.ts buildCtx()` on top of ratings — [attackMult, defenseMult, midfieldMult] per side:

- **Formation profiles** (5): `high-press` (4-3-3, 4-2-3-1, 3-4-2-1), `balanced` (4-4-2, 4-4-1-1), `midfield-heavy` (3-5-2, 4-3-2-1, 3-6-1, 4-1-4-1, 4-1-2-1-2, 4-2-2-2), `defensive-block` (5-3-2, 5-4-1, 4-5-1, 3-4-1-2), `wide-attack` (3-4-3, 4-2-4). 5×5 table `FORMATION_MATCHUP`.
- **Style profiles** (6): `possession-build` (possession, tiki-taka, football-total), `direct-attack` (contre-attaque, direct, long-ball), `high-intensity` (pressing, gegenpressing), `defensive` (ultra-defensif, bloc-median), `wide-play` (ailes), `chaos`. 6×6 table `STYLE_MATCHUP`.
- Custom styles are classified by `customStyleProfile(mods)` (slider thresholds); returns `null` when no axis dominates → no style-matchup layer for that side. One-sided style → `STYLE_VS_NEUTRAL` baseline.
- UI metadata exported for TacticsPanel: `FORMATION_PROFILE_LABEL/DESC`, `STYLE_PROFILE_LABEL/DESC`.
- Applied in ALL sim paths: `worker.ts buildCtx()` (live + multiplex), `season.ts simulateMatch()` (league instant sim). Custom styles wired through MatchSetup, PlaySetup, CompetitionMatchLive, MultiplexLive, and all halftime/pause tactic-change callbacks via `resolveActiveCustomStyle()` (localTactics.ts).
- Worker `updatetactic` rebuilds BOTH sides (matchup is cross-side) and strips players already on pitch from rebuilt benches.

### Situational layer (`engine.ts effRating()`)

Applied per tick on top of precomputed ratings, for possession + attack/defense rolls:

- **Reds**: `0.93^reds` (unchanged).
- **Home advantage**: att ×1.04, mid ×1.05, def ×1.02 — OPT-IN via `rules.homeAdvantage` (default false). Chosen pre-match: checkbox in MatchSetup/PlaySetup rules, PreMatchModal (competition, via sessionStorage `footsim.homeAdvantage.{mid}`), and per-match in MultiplexLive pending screen.
- **Fatigue** (`fatigueMult`, exported): from 60', penalty = `(0.05 + intensity×0.35) × progress × (1 − relief) × weatherFatigue`, floor 0.70. `intensity` derives from tacticMods (midfield/foul/shot excess) — gegenpressing/chaos tire fast, possession styles last. `relief` = subs×0.12 + stamina bonus (cap 0.6). `progress` reaches 1.0 at 90', 2.0 at 120'. Defense takes half the penalty.
- **Late push** (`latePushMults`, exported): from 75', trailing side att ×1.12 / def ×0.88; leading side att ×0.94 / def ×1.06.
- **Momentum**: 6 minutes after scoring, scorer side ×1.05 on all sectors (`state.momentum`).

### Weather (`sim/weather.ts`)

- 14 `ClimateZone`s grouping countries (labels + descriptions in French), each with temp range + per-`WeatherKind` weights (clair/couvert/pluie/orage/neige/vent/brouillard/canicule).
- `rollWeather(zone, hashSeed(matchId))` — deterministic per match (mulberry32).
- Sources: competition `config.climateZone` (selector in CompetitionNew) → rolled in CompetitionMatchLive + MultiplexLive; friendlies: zone select in MatchSetup/PlaySetup ('' = none, 'auto' = home team continent via `zoneFromContinent`).
- Engine effects (`weatherFx`): keyPass/dribble/foul/shotFreq weight mults, on-target delta (base 0.55), set-piece conversion delta, fatigue multiplier (canicule ×1.40; temp ≥32° or ≤0° add extra). Displayed in Scoreboard (`WEATHER_LABEL · temp°C`, no emoji) + visual rain/snow/fog overlay on Pitch.
- Persisted: `MatchState.weather` (prapi StoredMatch stores full state), `StoredMatch.weather` on the legacy GitHub path.

### Referees (`sim/referees.ts`)

- 50 deterministic profiles (seeded from id): `foulStrictness` ×0.85–1.25, `cardStrictness` ×0.70–1.50, `redTendency` ×0.60–1.80, `penaltyTendency` ×0.70–1.40, `addedTimeBias` −1..+2 min.
- `pickReferee(hashSeed(matchId))` in MatchSetup/PlaySetup/CompetitionMatchLive/season.ts; `pickDistinctReferees(n, seed)` in MultiplexLive — every match of a multiplex day gets a DIFFERENT referee (Fisher-Yates seeded, n ≤ 50).
- Engine reads `state.referee` (set from `input.referee` in worker start, added time bias applied there): multiplies foul weight, yellow/red probabilities, penalty chance. Displayed in Scoreboard ("Arbitre : X (tempérament)", trait tooltip); persisted in state → visible in replay.

### Tactical directives (Consignes tab in TacticsPanel)

`TeamTactics.planB` (max 3 `PlanBRule`), `.setPieceTakers` ({penalty, freeKick, corner} player ids), `.captainId`. Flow: pages pass them in `MatchInput.home/away` → `precomputeSide` 14th arg `directives` → `SideRatings.planB/takers/captainId`. Persisted in PR_API `footsim_tactics.directives` JSONB (migration `footsim_tactic_directives`).

- **Plan B** (`applyPlanBRules`, exported, called each tick): trigger `losing|winning|drawing|redCard` + `fromMinute` + target = a SAVED TACTIC (`tacticId/tacticName`; `style` kept as legacy/fallback when the team has no other saved tactics). `enrichPlanBRules(planB, team)` (precompute.ts, called in worker `buildCtx` from `input.side.team`) resolves the target tactic's style — active custom style mods included — into `ResolvedPlanBRule.modsOverride/label`. Fires once per rule: swaps `tacticMods` and scales attack/midfield/defense ratings by new/old mult ratio (kick-off matchup layer stays frozen; formation/XI unchanged). Optional opponent condition `vsMode: 'only'|'except'` + `vsTeamId`: rule only applies (or is cancelled) against that team (checked vs `ctx.<opp>.team.id` each tick, rule NOT consumed when gated). Emits `tacticChange` event (📋 with the tactic name). New PlanBRule fields ride in the `directives` JSONB — no PR_API change needed. UI: ConsignesPanel plan-B rows target the OTHER saved tactics (`otherTactics` prop from TacticsPanel) + a per-rule opponent select (teams store).
- **Set-piece takers** (`designatedTaker`): override auto-pick for penalty/free-kick/corner when on pitch. Corner taker's `crossing` adds up to ±7pts to header conversion; corner events now carry `playerId`.
- **Captain** (`captainOnPitch`): while on pitch — team fouls ×0.93, yellows ×0.90, opponent momentum halved (1.025 vs 1.05).
- **Captain/taker selectors** (`PlayerSearchSelect` in TacticsPanel): searchable dropdown; starting-XI players sorted first with an "XI" badge (ConsignesPanel receives `lineup`).

### Counter-tactics (counterTactics)

`SavedTactic.counterTactics: {teamId, teamName, tacticId, tacticName}[]` — "if opponent X lines up their tactic Y, activate THIS tactic". Managed in the dedicated `CounterTacticsPanel` (⚔ collapsible, under TacticsSummary in MyTeam + TeamDetail; loads the opponent's saved-tactic names via `fetchTeam`). One opponent tactic triggers at most ONE counter (adding a mapping strips the pair from other tactics). Persisted in the `directives` JSONB.
- **Kick-off**: `resolveMatchTactics(home, away, overrides?)` (localTactics.ts) — both sides' base tactic (manual override > active), then counters applied against the OTHER side's base (single pass, no loop; an overridden side is never re-modified but CAN be countered). Used by all 4 match flows (MatchSetup/PlaySetup effects, CompetitionMatchLive, MultiplexLive).
- **Mid-match**: every tactic-change callback (MatchLive/CompetitionMatchLive pause + halftime, MultiplexLive pause + halftime) applies the change via `tacticToSidePatch(tactic, team)` then checks `findCounterTactic(oppTeam, teamId, tactic.id)` — if it matches, the opposing side's counter is pushed as a second `updatetactic` (⚔ toast). No recursion (the riposte does not re-trigger a counter check).
- The old vsTeams "🎯 Contre" targeting was REMOVED (UI + resolution) in favor of counter-tactics; `SavedTactic.vsTeams/vsTeamId/vsTeamName` remain in the type/persistence as dead legacy fields — never resurrect them.
- **Worker `updatetactic` invariant**: carries over `done` flags for planned subs AND plan B rules (by rule id) — a fired plan B must never re-arm after a mid-match tactic change.

### GK emergency (`engine.ts forceGkReplacement`, exported)

- GK red card → the backup GK MUST come on: weakest outfielder is sacrificed (counts as a sub). No backup GK / no subs left → outfielder in goal: `resolveShot`/penalties GK fallback is 35 (not 50).
- GK injury → `applyInjury` now prefers the bench GK over the first available player.

### Pitch scenes & replay

- `Pitch.tsx sceneTargets()`: set-piece choreographies in canonical space ("my side attacks x=100, own goal at 0"), converted to SVG per side/half. Penalty (taker at spot, arc outside box, GK on line), corner (5 in box + man-marking + taker at flag), free kick (4-man wall between ball and goal), offside (flat defensive line + dashed offside line + flag), goal (celebration cluster at corner). Yellow/red card flash above the sanctioned player. Striped mowing pattern + goal nets; viewBox `-2 -3 104 56`.
- `Pitch.tsx buildBallPath()`: the ball no longer teleports — each event plays a keyframed waypoint path filling ~85% of the tick window (`SPEED_TO_MS`), starting from the previous path's end (continuity: corner parks the ball at the flag, the following header's cross starts from the flag; penalty/freeKick park the ball, the next goal/save/miss event plays the strike). Build-up relay point for shots/keyPass, zigzag for dribbles, differentiated strike endings (goal → net, save → GK, crossbar → bar + bounce, shot → wide of post). Pass/strike events draw a fading dashed trail (`pathLength` animation). Idempotent per event id (`ballRef` guards double-renders); paths > 55 units (halftime flip, replay seek) skip the build-up. Replay forces `speed: '1'` so instant-simulated matches still animate.
- **Kits** (`lib/kits.ts`): `resolveKits(homeTeam, awayTeam)` — home wears `jerseyColor`; if both primaries clash (perceptual distance < 55), away switches to `jerseyAwayColor` (editable in TeamDetail settings, PR_API column `jersey_away_color`, migration `footsim_jersey_away_color`) or an auto fallback. `KitLegend` (exported from Pitch.tsx) shows the color↔team mapping under the pitch in MatchLive/CompetitionMatchLive/MatchReplay.
- **Replay**: route `/match/:id/replay` (`MatchReplay.tsx`) — loads prapi `StoredMatch` (full input+state), replays recorded events on the animated pitch. Initial XIs reconstructed by rewinding substitution/red/injury events from the final `homeOnPitch`/`awayOnPitch`. Controls: play/pause, ×0.5–×4, minute slider, prev/next event; stats rebuilt from event counts. Entry points: TeamDetail → Historique ("▶ Revoir", hidden for `lpm-bonus-*` synthetic rows) and CompetitionDetail expanded match ("▶ Revoir le match", uses `matchFileId ?? id`).
- **StoredMatch id convention**: competition matches are stored under the RAW comp-match id (`m.id`), never the `comp-<competitionId>-<matchId>` engine matchId. CompetitionMatchLive sets `matchFileId` to the raw id; MatchReplay and CompetitionDetail's report both fall back to the raw id (last dash segment) when a legacy `comp-…` link 404s. MultiplexLive stores the FULL `slot.input` (formations, lineups, tactics, plan B, positionMap — it also tracks mid-match tactic changes) so replays reflect saved tactics; never rebuild a minimal input there.
- **UI fade-in**: `globals.css` animates `main > *` and `.fade-in` with an opacity-only 0.28s fade (no transform — keeps `position:fixed` modals sane), disabled under `prefers-reduced-motion`.
- **Pitch perf rule**: NO infinite/continuous framer-motion animations — framer drives SVG attributes from a JS rAF loop at 60fps and cooks CPUs during live matches/replays. Continuous effects use CSS (`globals.css`): `.fs-token` (player movement, CSS transform transition — replaces the old PLAYER_SPRING), `.fs-pulse` (ball-holder ring), `fs-weather-fall` (rain/snow groups), `.fs-wiggle` (penalty ball). framer-motion stays ONLY for bounded one-shot animations (ball path keyframes, trail, cards, goal flash, offside). Any modal opened from inside a framer-animated card MUST `createPortal` to `document.body` (transform = containing block traps `position:fixed` — bug seen with TacticalReportModal in multiplex).
- **Tactical report suggested mods**: `snapToCustomStyleGrid` (tacticalReport.ts) snaps `counterTactic.customMods` to the custom-style editor grid — 5% steps, ±30% bounds, 30-pt budget (bonus 1pt/%, malus refunds 0.5) — so the player can copy the suggestion into the editor as-is.
- **Tactical report access control** (inside TacticalReportModal, applies everywhere it's used): admin sees both side tabs; a non-admin manager is LOCKED to the side whose `team.managerDiscordId` matches their session (tabs hidden); a non-admin managing neither team gets a "réservé aux managers" message. Never expose the opponent's report to a regular player.
- **MyTeam self-service**: managers can rename their players (✏️ in StartingXI's XI/bench/rest tables via `onRenamePlayer` prop — the standalone roster table below was removed, as was the "📋 XI tactique défini" label) and their coach (✏️ next to the name, `onRename` prop on CoachReadPanel) via `RenameModal` → `saveTeamData` (single PUT). "⚙ Paramètres" header button → `TeamSettingsModal`: team name, home/away jersey colors, optional full player-name regeneration via `pickNameMixed(team.cultures)` (stats/ages untouched). The dashboard "Résultat forcé" UI was REMOVED (team.matchOutcome persists but has no editor).
- **Match history**: shared `components/team/MatchHistoryTable.tsx` used by BOTH MyTeam Historique and TeamDetail (dashboard passes `onDelete/onDeleteAll` extras). Columns: date/opponent/score/CMF pts/importance + competition link (`RecentMatchSummary.competitionId/competitionName`, populated by CompetitionMatchLive/MultiplexLive/CompetitionDetail summary builders) + 📋 tactical report (StoredMatch load with legacy `comp-…` fallback, restriction above applies) + ▶ replay. Entries predating competitionId get BACKFILLED once: loads the team's competitions (summaries → full comps), maps matchId → comp, persists via `onEnrich`.

### Saved tactics deletion (TeamDetail)

Deleting the last saved tactic also clears legacy `team.tactics` + local caches, and the init effect only seeds "Tactique de base" when `team.savedTactics === undefined` (legacy team) — `[]` means the user deleted everything and must NOT resurrect.

### Tick loop (`sim/engine.ts → tick()`)

1 tick = 1 simulated minute. Worker calls `tick()` repeatedly at interval set by speed.

**Status machine**:
```
pregame → firstHalf (1–45+HT) → halftime → secondHalf (46–90+AT)
  → [extraTimeFirst (91–105) → extraTimeHalfTime → extraTimeSecond (106–120+)]
  → [penalties] → fulltime
```
Both `halftime` and `extraTimeHalfTime` stall the loop until UI sends `resume`.

**Each tick**:
1. Advance `minute++`; check end-of-period thresholds (with added time).
2. **Possession roll**: `P(home) = homeMid / (homeMid + awayMid)` where each side's mid is multiplied by `0.93^(reds)`.
3. **Event roll** — weighted draw over:

| Event | Weight formula |
|---|---|
| shot | `0.08 × (0.6 + pAttack) × shotFreqMult` |
| foul | `0.24 × opp.foulRateMult` (~11 fautes/équipe, réaliste) |
| corner | `0.11 × (1 + (shotFreqMult−1)×0.8)` if shotFreqMult>1, else `0.11` (~5/équipe) |
| offside | 0.045 (0 if `noOffside` rule) (~2/équipe) |
| keyPass | `0.18 × midfieldMult` |
| freeKick | 0.03 |
| dribble | `0.28 × pAttack × max(1, attackMult)` |
| clearance | `0.03 × (1 − pAttack)` |
| (nothing) | remainder |

where `pAttack = 0.5 + (rawPAttack − 0.5) × 0.82` (compression légère : les gros écarts d'effectif gardent ~10% d'accidents — 85v65 ≈ 88% win, 80v70 ≈ 65%), `rawPAttack = myAttack / (myAttack + oppDefense)`, both multiplied by `0.93^reds`. Tactic mods now apply to `keyPass`, `dribble`, and `corner` weights — styles with high `midfieldMult` generate more key passes, styles with `shotFreqMult > 1` generate more corners, styles with `attackMult > 1` generate more direct runs.

### Shot resolution

`resolveShot()` returns `bool` (goal scored). **Recalibré réaliste (juil. 2026)** — cibles mesurées Monte-Carlo (harness `sim/realism.audit.test.ts`, en `describe.skip` — retirer le skip pour re-mesurer après TOUT changement engine) : 2.7-2.8 buts/match, 0-0 ~7.5%, nuls ~25%, conversion ~11%, xG ~1.35/équipe.
- GK ramené à l'échelle 1-20 : `gk20 = gkOverall / 5` (avant : échelle 1-100 mélangée, le gardien ne pesait quasi rien → scoring inversé par niveau).
- `pGoal = sigmoid((finishing + composure − 2×gk20) / 8 − 1.0) × mult` clamped `[0.03, 0.60]`
- On-target `0.38 + weather delta` (réel ~35%) ; if on-target: roll `pGoal` → goal, else 10% crossbar, else save.
- **xG = pOnTarget × pGoal** (probabilité réelle du tir, cadrage inclus — avant le pGoal complet était compté même hors cadre → xG 2.6× trop haut). Idem `tryPenaltyShot` et `injectGoal`.
- Penalty in-game (`tryPenaltyShot`) : cadré 0.94, `pGoal = sigmoid((fin+com−2×gk20)/6 + 1.1)` clamp `[0.55, 0.90]` → conversion ~76% (réel).
- After any goal in ET: `tryShot()` calls `checkGoldenGoal()` → fulltime if golden goal rule active.

Special shot chains:
- **Foul** (1.3% chance × penaltyTendency ; corruption single-side 3.5%) → penalty (~0.3 péno/match)
- **Corner** (45% chance) → header → shot with `mult=0.85`
- **FreeKick** (30% chance) → shot with `mult=0.75`
- **Dribble** (40% chance) → shot with `mult=1.05`
- Blessure sur faute : 1.2% (fautes ×3 → même taux global qu'avant, ~0.25 blessé/match)

### Cards

`red` direct: `0.0025 + 0.0025 × (aggression/20)` per foul; `yellow`: `0.15 + 0.06 × (aggression/20)` per foul, **× 0.18 si le fauteur est déjà averti** (retenue — sans ça les 2ᵉ jaunes explosaient à 0.55/match avec les fautes réalistes). Cibles : ~1.9 jaunes/équipe, ~0.2 rouge/match. Second yellow on same player → red. Red → player removed from `homeOnPitch`/`awayOnPitch`.

### Auto-substitutions

Triggered at halftime transition (`status: halftime → secondHalf`). Per side: `min(2, maxSubs − subsUsed)` subs. Swaps lowest-overall non-GK starters for best bench player of same position family (CB/LB/RB, DM/CM/AM/LM/RM, LW/RW/ST). Falls back to best available if no family match.

### Penalty shootout (`simulatePenalties()`)

5 kicks each then sudden death (max 20 rounds). `pGoal = sigmoid((finishing + composure − 2×(gkOverall/5)) / 6 + 1.1)` clamped `[0.55, 0.90]` (~75% conversion, même échelle GK que resolveShot). Result stored in `state.penaltyScore`.

### Match rules (`MatchRules`)

| Field | Default | Effect |
|---|---|---|
| `noOffside` | false | sets `wOffside = 0` |
| `maxSubs` | 5 | caps auto-subs + manual subs |
| `extraTime` | false | adds 2×15 min if tied at 90' |
| `goldenGoal` | false | first ET goal ends match |
| `penalties` | false | TAB after ET (or after 90' if no ET) |

### Speeds

`0.5` (2000 ms/tick), `1` (1000 ms), `2` (500 ms), `5` (200 ms), `instant` (sync loop, auto-resumes both halftimes).

## Encoding gotcha

`btoa` is Latin-1 only. Names with accents and event emojis (⚽🟨🟥🧤) blow up. `lib/github/api.ts` exposes `utf8ToBase64` / `base64ToUtf8` using `TextEncoder`/`TextDecoder`. **Use only those for content payloads** — never raw `btoa`/`atob` for user data.

## Theme

`html.dark` toggled by `lib/theme.ts` based on user local hour (`6h-19h` day, else night). CSS vars defined in `src/styles/globals.css` for `bg, surface, text, muted, border, accent, danger, warning, pitch, pitch-line`. Pitch SVG uses `var(--pitch)`/`var(--pitch-line)`.

## Routing

```
/                              public home
/auth/callback                 Discord redirect target
/no-access                     non-admin
/dashboard                     RequireAdmin
  /                            overview cards
  /teams, /teams/new, /teams/:slug
  /settings
/match                         RequireAdmin (setup)
/match/:id                     RequireAdmin (live)
```

## Testing

Vitest, jsdom env, setup at `tests/setup.ts`. Pure-logic units only (gen, github api, store, auth helpers). No E2E.

## Conventions

- French UI strings (admin language).
- Commit prefixes: `feat`, `fix`, `chore`, `docs`, `ci`, `feat(scope)`.
- All commits Co-Authored-By Claude.
- File paths absolute when calling tools.
- Add tests when touching `lib/gen` or `lib/sim` or `lib/github`.

## Press system (`lib/competition/press.ts`, ~3600 lines)

- **Fact-driven coherence**: `buildMatchFacts(state, home, away, seed)` extracts real match facts from the final `MatchState` — chronological scorers (penalty flag = `penalty` event same side/minute before the goal), red cards (from `red` events, NOT `state.cards`), yellow counts, referee (`refereeToMention`), weather label, deterministic attendance (12k–80k from seed), `comeback` (side that won/drew after trailing 2+), `lateWinner` (decisive goal ≥85' with final gap of 1). Both CompetitionMatchLive and MultiplexLive build it once per match and pass `facts` + `cote` to `generateMatchPressItem`.
- **Narrative overrides** (perf categories only, never doping/scandal/critique/eliminated, skipped in F/3rd): remontada (always, → exploit + boost), upset via `cote ≥ 3` (80%, cote quoted in headline), choke = blew a 2-goal lead (→ crise + shock), late winner (60%, scorer mentioned + clickable). Fact suffixes (max 2/article): doublé/triplé (real scorer + mention), red card (loss = turning point / win = held at 10), clean sheet, sterile domination (poss ≥58 + shots ≥ opp+4 on loss/draw), hold-up (win with poss ≤42 + fewer shots), weather flavor, referee flavor on carded matches.
- **Featured player** = actual top scorer of the match when diff ≥ 0 (fallback top-5 overall). Cotes: `computeMatchCotes(gsHome, gsAway)` — P ∝ strength².
- **Referee**: `PressMentionReferee` (type 'referee' in `PressMention` union) is clickable like players/coaches — popup shows temperament + tendency gauges. `generateRefereePressItem` (category `arbitrage`, teamId null) fires ~50% when cards ≥7 / red+hot-profile ref / 2 reds. `generateCmfDisciplineItem` (CMF communiqué, type `discipline`) ~50% when 2 reds or ≥9 cards. Both called once per match after the per-team loop.
- **matchSnapshot** now carries `referee` (full mention), `weather`, `attendance`, `scorers[]` — displayed in the match popup (scorers per side with minutes, clickable referee row). Both live pages hoist ONE `pressSnap` per match reused by every article (match, forme, drame, CMF).
- **Forme/méforme**: `generateFormePressItem` also takes `lossStreak` (3+: crisis article, 3→50%, 4→35%, 5+→always). Call sites walk previous press items (`matchId` present, categories victoire/exploit vs defaite/crise/critique) for both streak directions.
- **Journalists**: byline on critique (always), scandale (60%), match articles (45%); arbitrage always signed. CMF items never signed (official communiqués).
- **Format coherence**: `generateMatchPressItem` takes `format` ('league'|'cup'|'groups_knockout'|'lpm') — when provided it is the SOURCE OF TRUTH for LPM detection (the 40+ teams heuristic is legacy-only fallback). Pure league (`format==='league'` + phase league): NO qualification/relegation/elimination talk ever — `isEliminated` is neutralized, danger zone uses `LEAGUE_BOTTOM_BODIES`, bottom-half slump uses `LEAGUE_TITLE_FADING_BODIES`. Group phases use `GROUP_DANGER_BODIES` (qualification talk). LPM keeps its Zone Or/Rouge/barrages banks. Phase naming: R64=trente-deuxièmes, R32=seizièmes, R16=huitièmes (PHASE_LABEL and KO banks were once swapped — keep consistent with `KNOCKOUT_PHASE_LABEL`).
- **Shootouts**: engine pushes shootout kicks as `penalty` events (never `goal`) so scorers/comeback stay clean; `MatchFacts.penaltyScore` + snapshot `penalties` narrate KO draws (TAB_WIN/LOSS_BODIES, phase headline banks — CHAMPION for F) and lpm_playoff legs decided on pens; popup shows "x-y t.a.b." under the score. The sterile-domination suffix is gated on NOT having won overall (pens win included).
- **PressTab UI** (CompetitionDetail): newspaper layout — masthead « LA TRIBUNE DU BALLON », per-round « Édition · Journée N » separators, first article of the newest round rendered as hero « À la une » (font-display headline), rest in `md:grid-cols-2`. Category `arbitrage` has its own label/color; old persisted items without new fields render fine (all optional).

## Known scope gaps

- 12 cultures from spec deferred (chinois, vietnamien, thai, indonesien, persan, indien, israelien, bresilien, argentin, mexicain, anglo-americain, quebecois). Add JSON in `src/data/names/` and re-add to `Culture` union + `CULTURES` + `CULTURE_LABEL` in `lib/types.ts`.
- No E2E tests.
- No mobile-specific layouts (desktop-first).
- No transfers / contracts / leagues.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
