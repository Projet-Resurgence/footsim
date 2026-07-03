import { describe, expect, it } from 'vitest';
import type { Player, Position } from '@/lib/types';
import { applyPlanBRules, fatigueMult, latePushMults, forceGkReplacement, initialState, tick, type EngineCtx } from './engine';
import { precomputeSide, getTacticMods } from './precompute';
import { DEFAULT_RULES, type MatchState } from './types';

const POSITIONS: Position[] = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST'];

function fullStats(stamina = 10): Player['stats'] {
  const tech = { passing: 10, crossing: 10, dribbling: 10, finishing: 10, firstTouch: 10, heading: 10, longShots: 10, tackling: 10, marking: 10 };
  const mental = { vision: 10, decisions: 10, composure: 10, anticipation: 10, offTheBall: 10, aggression: 10, workRate: 10 };
  const physical = { pace: 10, acceleration: 10, strength: 10, stamina, agility: 10, balance: 10, jumping: 10 };
  return { technical: tech, mental, physical, goalkeeping: null };
}

function makeRoster(n = 20, stamina = 10): Player[] {
  const roster: Player[] = [];
  for (let i = 0; i < n; i++) {
    roster.push({
      id: `p${i}`, firstName: 'T', lastName: `P${i}`, age: 25,
      position: POSITIONS[i % POSITIONS.length], altPositions: [], preferredFoot: 'right',
      stats: fullStats(stamina), overall: 60,
    });
  }
  // guarantee at least 2 GK
  roster[0].position = 'GK';
  roster[12].position = 'GK';
  return roster;
}

function makeCtx(homeStyle?: Parameters<typeof precomputeSide>[3], awayStyle?: Parameters<typeof precomputeSide>[3], stamina = 10): { ctx: EngineCtx; state: MatchState } {
  const homePlayers = makeRoster(20, stamina);
  const awayPlayers = makeRoster(20, stamina).map((p) => ({ ...p, id: `a-${p.id}` }));
  const home = precomputeSide(homePlayers, '4-3-3', undefined, homeStyle);
  const away = precomputeSide(awayPlayers, '4-3-3', undefined, awayStyle);
  const ctx: EngineCtx = {
    home: { team: { name: 'Home' } as EngineCtx['home']['team'], players: new Map(homePlayers.map((p) => [p.id, p])), ratings: home },
    away: { team: { name: 'Away' } as EngineCtx['away']['team'], players: new Map(awayPlayers.map((p) => [p.id, p])), ratings: away },
    eventCounter: { v: 0 },
  };
  const state = initialState('m1', 'instant', { ...DEFAULT_RULES });
  state.homeOnPitch = [...home.lineup];
  state.awayOnPitch = [...away.lineup];
  return { ctx, state };
}

describe('fatigueMult', () => {
  it('is neutral before the 60th minute', () => {
    const { ctx, state } = makeCtx('gegenpressing');
    state.minute = 55;
    expect(fatigueMult(state, ctx, 'home')).toBe(1);
  });

  it('penalizes high-intensity styles more than possession at the 90th', () => {
    const press = makeCtx('gegenpressing');
    press.state.minute = 90;
    const possession = makeCtx('possession');
    possession.state.minute = 90;
    const fPress = fatigueMult(press.state, press.ctx, 'home');
    const fPoss = fatigueMult(possession.state, possession.ctx, 'home');
    expect(fPress).toBeLessThan(fPoss);
    expect(fPress).toBeGreaterThanOrEqual(0.75);
    expect(fPoss).toBeLessThan(1);
  });

  it('is relieved by substitutions (fresh legs)', () => {
    const a = makeCtx('gegenpressing');
    a.state.minute = 85;
    const before = fatigueMult(a.state, a.ctx, 'home');
    a.state.homeSubs = 4;
    const after = fatigueMult(a.state, a.ctx, 'home');
    expect(after).toBeGreaterThan(before);
  });

  it('is relieved by high stamina players', () => {
    const low = makeCtx('pressing', undefined, 8);
    low.state.minute = 90;
    const high = makeCtx('pressing', undefined, 18);
    high.state.minute = 90;
    expect(fatigueMult(high.state, high.ctx, 'home')).toBeGreaterThan(fatigueMult(low.state, low.ctx, 'home'));
  });

  it('keeps degrading during extra time, floored at 0.70', () => {
    const { ctx, state } = makeCtx('chaos');
    state.minute = 120;
    const f = fatigueMult(state, ctx, 'home');
    expect(f).toBeGreaterThanOrEqual(0.70);
    expect(f).toBeLessThan(fatigueMult({ ...state, minute: 90 } as MatchState, ctx, 'home'));
  });
});

describe('latePushMults', () => {
  it('is neutral before the 75th or when level', () => {
    const { state } = makeCtx();
    state.minute = 70;
    state.score = { home: 0, away: 1 };
    expect(latePushMults(state, 'home')).toEqual({ att: 1, mid: 1, def: 1 });
    state.minute = 80;
    state.score = { home: 1, away: 1 };
    expect(latePushMults(state, 'home')).toEqual({ att: 1, mid: 1, def: 1 });
  });

  it('trailing side pushes forward, leading side shuts up shop', () => {
    const { state } = makeCtx();
    state.minute = 80;
    state.score = { home: 0, away: 1 };
    const trailing = latePushMults(state, 'home');
    const leading = latePushMults(state, 'away');
    expect(trailing.att).toBeGreaterThan(1);
    expect(trailing.def).toBeLessThan(1);
    expect(leading.def).toBeGreaterThan(1);
    expect(leading.att).toBeLessThan(1);
  });
});

describe('full match smoke test', () => {
  it('completes an instant match with the situational layer active', () => {
    const { ctx, state } = makeCtx('gegenpressing', 'ultra-defensif');
    let guard = 0;
    while (state.status !== 'fulltime' && guard++ < 400) {
      tick(state, ctx);
      if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') tick(state, ctx);
    }
    expect(state.status).toBe('fulltime');
    expect(state.minute).toBeGreaterThanOrEqual(90);
    expect(state.possession.home + state.possession.away).toBe(100);
    expect(state.score.home).toBeGreaterThanOrEqual(0);
    expect(state.score.away).toBeGreaterThanOrEqual(0);
  });

  it('momentum is set after a goal', () => {
    // Run matches until one produces a goal, then check momentum bookkeeping
    for (let attempt = 0; attempt < 10; attempt++) {
      const { ctx, state } = makeCtx('chaos', 'chaos');
      let guard = 0;
      while (state.status !== 'fulltime' && guard++ < 400) {
        tick(state, ctx);
        if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') tick(state, ctx);
      }
      if (state.score.home + state.score.away > 0) {
        expect(state.momentum).toBeDefined();
        expect(['home', 'away']).toContain(state.momentum!.side);
        return;
      }
    }
    throw new Error('no goal in 10 chaos-vs-chaos matches — statistically impossible');
  });
});

describe('applyPlanBRules', () => {
  it('switches style once when the trigger condition is met after fromMinute', () => {
    const { ctx, state } = makeCtx('possession');
    ctx.home.ratings.planB = [{ id: 'r1', trigger: 'losing', fromMinute: 70, style: 'chaos', done: false }];
    state.minute = 75;
    state.score = { home: 0, away: 1 };
    const attackBefore = ctx.home.ratings.attack;

    applyPlanBRules(state, ctx, 'home');

    expect(ctx.home.ratings.planB[0].done).toBe(true);
    expect(ctx.home.ratings.tacticMods.foulRateMult).toBeCloseTo(1.35); // mods chaos
    expect(ctx.home.ratings.attack).toBeGreaterThan(attackBefore); // chaos att 1.10 vs possession 1.00
    expect(state.events.some((e) => e.type === 'tacticChange' && e.side === 'home')).toBe(true);

    // Ne se redéclenche pas
    const attackAfter = ctx.home.ratings.attack;
    applyPlanBRules(state, ctx, 'home');
    expect(ctx.home.ratings.attack).toBe(attackAfter);
  });

  it('does not fire before fromMinute or when the condition is false', () => {
    const { ctx, state } = makeCtx('possession');
    ctx.home.ratings.planB = [{ id: 'r1', trigger: 'losing', fromMinute: 70, style: 'chaos', done: false }];
    state.minute = 60;
    state.score = { home: 0, away: 1 };
    applyPlanBRules(state, ctx, 'home');
    expect(ctx.home.ratings.planB[0].done).toBe(false);

    state.minute = 80;
    state.score = { home: 1, away: 1 }; // pas mené
    applyPlanBRules(state, ctx, 'home');
    expect(ctx.home.ratings.planB[0].done).toBe(false);
  });

  it('fires on red card trigger', () => {
    const { ctx, state } = makeCtx();
    ctx.away.ratings.planB = [{ id: 'r2', trigger: 'redCard', fromMinute: 1, style: 'bloc-median', done: false }];
    state.minute = 30;
    state.cards.away.red.push('a-p5');
    applyPlanBRules(state, ctx, 'away');
    expect(ctx.away.ratings.planB[0].done).toBe(true);
    expect(ctx.away.ratings.tacticMods.defenseMult).toBeCloseTo(1.12); // bloc médian
  });

  it('applies the resolved mods of a targeted saved tactic (modsOverride)', () => {
    const { ctx, state } = makeCtx('possession');
    const mods = { shotFreqMult: 1.10, foulRateMult: 1.00, midfieldMult: 0.95, attackMult: 1.15, defenseMult: 0.90 };
    ctx.home.ratings.planB = [{
      id: 'r1', trigger: 'losing', fromMinute: 60,
      tacticId: 'tac-off', tacticName: 'Offensive totale', modsOverride: mods, label: 'Offensive totale',
      done: false,
    }];
    state.minute = 65;
    state.score = { home: 0, away: 1 };
    applyPlanBRules(state, ctx, 'home');
    expect(ctx.home.ratings.planB[0].done).toBe(true);
    expect(ctx.home.ratings.tacticMods).toEqual(mods);
    const ev = state.events.find((e) => e.type === 'tacticChange');
    expect(ev?.text).toContain('Offensive totale');
  });

  it('respects the opponent condition (only / except)', () => {
    const make = (vsMode: 'only' | 'except', oppId: string) => {
      const { ctx, state } = makeCtx('possession');
      (ctx.away.team as { id?: string }).id = oppId;
      ctx.home.ratings.planB = [{
        id: 'r1', trigger: 'losing', fromMinute: 60, style: 'chaos',
        vsMode, vsTeamId: 'rival-id', vsTeamName: 'Rival',
        done: false,
      }];
      state.minute = 65;
      state.score = { home: 0, away: 1 };
      applyPlanBRules(state, ctx, 'home');
      return ctx.home.ratings.planB[0].done;
    };
    expect(make('only', 'rival-id')).toBe(true);    // face au rival → s'applique
    expect(make('only', 'autre-id')).toBe(false);   // autre adversaire → jamais
    expect(make('except', 'rival-id')).toBe(false); // face au rival → annulée
    expect(make('except', 'autre-id')).toBe(true);  // autre adversaire → s'applique
  });
});

describe('forceGkReplacement', () => {
  it('brings on the backup GK for the weakest outfielder after a GK red card', () => {
    const { ctx, state } = makeCtx();
    // Simule le rouge : retire le gardien du terrain
    const gkId = state.homeOnPitch.find((id) => ctx.home.players.get(id)?.position === 'GK')!;
    state.homeOnPitch = state.homeOnPitch.filter((id) => id !== gkId);
    const backupGk = ctx.home.ratings.bench
      .map((id) => ctx.home.players.get(id)!)
      .find((p) => p.position === 'GK');
    expect(backupGk).toBeDefined();

    forceGkReplacement(state, ctx, 'home');

    expect(state.homeOnPitch).toContain(backupGk!.id);
    expect(state.homeSubs).toBe(1);
    expect(state.homeOnPitch).toHaveLength(10); // 11 - rouge = 10, le sub remplace un joueur de champ
    expect(state.homeOnPitch.filter((id) => ctx.home.players.get(id)?.position === 'GK')).toHaveLength(1);
  });

  it('does nothing when no substitutions remain', () => {
    const { ctx, state } = makeCtx();
    const gkId = state.homeOnPitch.find((id) => ctx.home.players.get(id)?.position === 'GK')!;
    state.homeOnPitch = state.homeOnPitch.filter((id) => id !== gkId);
    state.homeSubs = state.rules.maxSubs;

    forceGkReplacement(state, ctx, 'home');

    expect(state.homeOnPitch.some((id) => ctx.home.players.get(id)?.position === 'GK')).toBe(false);
  });

  it('does nothing when a GK is still on the pitch', () => {
    const { ctx, state } = makeCtx();
    const before = [...state.homeOnPitch];
    forceGkReplacement(state, ctx, 'home');
    expect(state.homeOnPitch).toEqual(before);
    expect(state.homeSubs).toBe(0);
  });
});

describe('getTacticMods regression', () => {
  it('all styles stay compatible with the fatigue intensity derivation', () => {
    // intensity derives from midfield/foul/shot mods — must stay finite & bounded
    for (const style of ['possession', 'gegenpressing', 'ailes', 'bloc-median', 'football-total', 'chaos'] as const) {
      const m = getTacticMods(style);
      const intensity = Math.max(0, m.midfieldMult - 1) * 0.6 + Math.max(0, m.foulRateMult - 1) * 0.8 + Math.max(0, m.shotFreqMult - 1) * 0.3;
      expect(intensity).toBeGreaterThanOrEqual(0);
      expect(intensity).toBeLessThan(0.6);
    }
  });
});

describe('remplacements programmés (plannedSubs)', () => {
  function makePlannedCtx(plannedSubs: { outId: string; inId: string; minute?: number }[]) {
    const homePlayers = makeRoster(20, 10);
    // banc trié par overall desc — rendre le joueur réservé le MEILLEUR du banc
    // pour vérifier que les auto-subs de la mi-temps ne le consomment pas
    const home = precomputeSide(homePlayers, '4-3-3', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, plannedSubs);
    const awayPlayers = makeRoster(20, 10).map((p) => ({ ...p, id: `a-${p.id}` }));
    const away = precomputeSide(awayPlayers, '4-3-3');
    const ctx: EngineCtx = {
      home: { team: { name: 'Home' } as EngineCtx['home']['team'], players: new Map(homePlayers.map((p) => [p.id, p])), ratings: home },
      away: { team: { name: 'Away' } as EngineCtx['away']['team'], players: new Map(awayPlayers.map((p) => [p.id, p])), ratings: away },
      eventCounter: { v: 0 },
    };
    const state = initialState('m-planned', 'instant', { ...DEFAULT_RULES });
    state.homeOnPitch = [...home.lineup];
    state.awayOnPitch = [...away.lineup];
    state.homeBench = [...home.bench];
    state.awayBench = [...away.bench];
    state.homeAvailableBench = [...home.bench];
    state.awayAvailableBench = [...away.bench];
    return { ctx, state };
  }

  it('un remplacement programmé à la 60e survit aux auto-subs de la mi-temps', () => {
    // préparer: outId = un titulaire, inId = un joueur du banc (boosté meilleur overall)
    const probe = makePlannedCtx([]);
    const outId = probe.ctx.home.ratings.lineup.find((id) => probe.ctx.home.players.get(id)?.position !== 'GK')!;
    const inId = probe.ctx.home.ratings.bench[0];
    const { ctx, state } = makePlannedCtx([{ outId, inId, minute: 60 }]);
    // booster l'entrant pour qu'il soit la cible n°1 des auto-subs
    ctx.home.players.get(inId)!.overall = 99;

    // jouer jusqu'à la fin
    while (state.status !== 'fulltime') {
      tick(state, ctx);
      if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') tick(state, ctx);
    }

    // le remplacement programmé a bien eu lieu : l'entrant est sur le terrain (ou a été
    // remplacé plus tard), et l'échange out→in figure dans les événements
    const subEvents = state.events.filter((e) => e.type === 'substitution' && e.side === 'home');
    expect(subEvents.some((e) => e.playerId === inId && e.replacedId === outId)).toBe(true);
    const plan = ctx.home.ratings.plannedSubs[0];
    expect(plan.done).toBe(true);
  });

  it('les remplacements mi-temps (sans minute) utilisent tout le budget restant', () => {
    const probe = makePlannedCtx([]);
    const starters = probe.ctx.home.ratings.lineup.filter((id) => probe.ctx.home.players.get(id)?.position !== 'GK');
    const bench = probe.ctx.home.ratings.bench;
    const plans = [0, 1, 2].map((i) => ({ outId: starters[i], inId: bench[i] }));
    const { ctx, state } = makePlannedCtx(plans);

    while (state.status !== 'fulltime') {
      tick(state, ctx);
      if (state.status === 'halftime' || state.status === 'extraTimeHalfTime') tick(state, ctx);
    }
    // les 3 plans mi-temps exécutés (budget 5 > quota auto de 2)
    expect(ctx.home.ratings.plannedSubs.every((p) => p.done)).toBe(true);
    const subEvents = state.events.filter((e) => e.type === 'substitution' && e.side === 'home');
    for (const p of plans) {
      expect(subEvents.some((e) => e.playerId === p.inId && e.replacedId === p.outId)).toBe(true);
    }
  });
});
