/**
 * AUDIT RÉALISME — harness Monte-Carlo temporaire (supprimé après mesure).
 * Simule N matchs engine réel, sort les distributions à comparer au foot réel.
 */
import { describe, it } from 'vitest';
import type { Player, Position } from '@/lib/types';
import { initialState, tick, type EngineCtx } from './engine';
import { precomputeSide } from './precompute';
import { DEFAULT_RULES, type MatchState } from './types';

const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];

function statsFor(level: number): Player['stats'] {
  // level 1-20 : toutes les stats autour du niveau, léger bruit
  const v = () => Math.max(1, Math.min(20, Math.round(level + (Math.random() * 4 - 2))));
  const tech = { passing: v(), crossing: v(), dribbling: v(), finishing: v(), firstTouch: v(), heading: v(), longShots: v(), tackling: v(), marking: v() };
  const mental = { vision: v(), decisions: v(), composure: v(), anticipation: v(), offTheBall: v(), aggression: v(), workRate: v() };
  const physical = { pace: v(), acceleration: v(), strength: v(), stamina: v(), agility: v(), balance: v(), jumping: v() };
  return { technical: tech, mental, physical, goalkeeping: null };
}

function roster(prefix: string, overall: number): Player[] {
  const level = overall / 5; // 1-20
  const rs: Player[] = [];
  for (let i = 0; i < 20; i++) {
    rs.push({
      id: `${prefix}${i}`, firstName: 'T', lastName: `P${i}`, age: 25,
      position: POSITIONS[i % POSITIONS.length], altPositions: [], preferredFoot: 'right',
      stats: statsFor(level), overall,
    });
  }
  rs[0].position = 'GK';
  rs[12].position = 'GK';
  // GK stats
  for (const gi of [0, 12]) {
    const v = () => Math.max(1, Math.min(20, Math.round(level + (Math.random() * 4 - 2))));
    rs[gi].stats.goalkeeping = { reflexes: v(), handling: v(), aerial: v(), oneOnOne: v(), kicking: v(), throwing: v() };
  }
  return rs;
}

function playMatch(homeOvr: number, awayOvr: number, opts?: { homeAdvantage?: boolean }): MatchState {
  const hp = roster('h', homeOvr);
  const ap = roster('a', awayOvr);
  const hr = precomputeSide(hp, '4-3-3', undefined, 'possession');
  const ar = precomputeSide(ap, '4-3-3', undefined, 'possession');
  const ctx: EngineCtx = {
    home: { team: { name: 'H' } as EngineCtx['home']['team'], players: new Map(hp.map((p) => [p.id, p])), ratings: hr },
    away: { team: { name: 'A' } as EngineCtx['away']['team'], players: new Map(ap.map((p) => [p.id, p])), ratings: ar },
    eventCounter: { v: 0 },
  };
  const state = initialState('audit', 'instant', { ...DEFAULT_RULES, homeAdvantage: opts?.homeAdvantage ?? false });
  state.homeOnPitch = [...hr.lineup];
  state.awayOnPitch = [...ar.lineup];
  state.homeBench = [...hr.bench];
  state.awayBench = [...ar.bench];
  state.homeAvailableBench = [...hr.bench];
  state.awayAvailableBench = [...ar.bench];
  while (state.status !== 'fulltime') {
    tick(state, ctx);
    if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') tick(state, ctx);
  }
  return state;
}

function pct(n: number, d: number) { return ((n / d) * 100).toFixed(1) + '%'; }
function avg(xs: number[]) { return (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2); }

// describe.skip : outil de recalibrage — retirer .skip pour re-mesurer après tout changement engine
describe.skip('AUDIT réalisme engine', () => {
  it('mesures Monte-Carlo', () => {
    const N = 1500;

    // ── 1. Égal vs égal (75 vs 75) ──
    const eq = Array.from({ length: N }, () => playMatch(75, 75));
    const goals = eq.map((s) => s.score.home + s.score.away);
    const dist: Record<string, number> = {};
    for (const s of eq) {
      const key = s.score.home === s.score.away ? 'nul' : 'décision';
      dist[key] = (dist[key] ?? 0) + 1;
    }
    const goalHist: Record<number, number> = {};
    for (const g of goals) goalHist[Math.min(g, 9)] = (goalHist[Math.min(g, 9)] ?? 0) + 1;

    console.log('════════ ÉGAL vs ÉGAL (75v75, possession, N=' + N + ') ════════');
    console.log('Buts/match:', avg(goals), '| réel ~2.7');
    console.log('Distribution buts totaux:', Object.entries(goalHist).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${pct(v, N)}`).join(' '));
    console.log('Nuls:', pct(dist['nul'] ?? 0, N), '| réel ~25%');
    console.log('0-0:', pct(eq.filter((s) => s.score.home === 0 && s.score.away === 0).length, N), '| réel ~8%');
    console.log('Tirs/équipe:', avg(eq.flatMap((s) => [s.shots.home, s.shots.away])), '| réel ~12-13');
    console.log('Cadrés/équipe:', avg(eq.flatMap((s) => [s.shotsOnTarget.home, s.shotsOnTarget.away])), '| réel ~4.5');
    console.log('Conversion (buts/tirs):', pct(eq.reduce((a, s) => a + s.score.home + s.score.away, 0), eq.reduce((a, s) => a + s.shots.home + s.shots.away, 0)), '| réel ~10.5%');
    console.log('xG/équipe:', avg(eq.flatMap((s) => [s.xg.home, s.xg.away])), '| réel ~1.35');
    console.log('Fautes/équipe:', avg(eq.flatMap((s) => [s.fouls.home, s.fouls.away])), '| réel ~11-12');
    console.log('Jaunes/équipe:', avg(eq.flatMap((s) => [s.cards.home.yellow.length, s.cards.away.yellow.length])), '| réel ~1.9');
    console.log('Rouges/match:', avg(eq.map((s) => s.cards.home.red.length + s.cards.away.red.length)), '| réel ~0.18');
    console.log('Corners/équipe:', avg(eq.flatMap((s) => [s.corners.home, s.corners.away])), '| réel ~5');
    const pens = eq.map((s) => s.events.filter((e) => e.type === 'penalty').length).reduce((a, b) => a + b, 0);
    console.log('Pénos/match:', (pens / N).toFixed(3), '| réel ~0.25');
    console.log('Hors-jeu/équipe:', avg(eq.flatMap((s) => [s.offsides.home, s.offsides.away])), '| réel ~2');

    // ── 2. Écarts d'overall ──
    for (const [ho, ao] of [[80, 70], [85, 65], [75, 72]] as const) {
      const M = 800;
      const games = Array.from({ length: M }, () => playMatch(ho, ao));
      const w = games.filter((s) => s.score.home > s.score.away).length;
      const d = games.filter((s) => s.score.home === s.score.away).length;
      const l = M - w - d;
      const gf = avg(games.map((s) => s.score.home));
      const ga = avg(games.map((s) => s.score.away));
      console.log(`════════ ${ho} vs ${ao} (N=${M}) ════════`);
      console.log(`V/N/D: ${pct(w, M)}/${pct(d, M)}/${pct(l, M)} | buts ${gf}-${ga}`);
    }
    // Référence réelle : écart 10 pts ELO-like ≈ 60-65% win. Écart 20 ≈ 80%+.

    // ── 3. Home advantage opt-in ──
    const M2 = 800;
    const ha = Array.from({ length: M2 }, () => playMatch(75, 75, { homeAdvantage: true }));
    const hw = ha.filter((s) => s.score.home > s.score.away).length;
    const hd = ha.filter((s) => s.score.home === s.score.away).length;
    console.log(`════════ 75v75 + homeAdvantage (N=${M2}) ════════`);
    console.log(`V/N/D domicile: ${pct(hw, M2)}/${pct(hd, M2)}/${pct(M2 - hw - hd, M2)} | réel ~45/27/28`);

    // ── 4. Élite vs élite (90v90) — vérifie que le niveau absolu ne casse pas le scoring ──
    const el = Array.from({ length: 600 }, () => playMatch(90, 90));
    console.log('════════ 90 vs 90 (N=600) ════════');
    console.log('Buts/match:', avg(el.map((s) => s.score.home + s.score.away)), '| attendu proche de 2.7');
    console.log('Cadrés/équipe:', avg(el.flatMap((s) => [s.shotsOnTarget.home, s.shotsOnTarget.away])));
    const lo = Array.from({ length: 600 }, () => playMatch(55, 55));
    console.log('════════ 55 vs 55 (N=600) ════════');
    console.log('Buts/match:', avg(lo.map((s) => s.score.home + s.score.away)));
  }, 300_000);
});
