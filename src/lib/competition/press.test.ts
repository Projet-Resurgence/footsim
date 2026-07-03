import { describe, expect, it } from 'vitest';
import type { MatchState, MatchEvent } from '@/lib/sim/types';
import type { Player } from '@/lib/types';
import { REFEREES } from '@/lib/sim/referees';
import {
  buildMatchFacts,
  computeMatchCotes,
  generateMatchPressItem,
  generateRefereePressItem,
  generateCmfDisciplineItem,
  generateFormePressItem,
  generateCmfItems,
  generateFixingScandalItem,
  generateLockerRoomBrawlItem,
  generateDiscriminationItem,
  generateCmfCommunique,
} from './press';

function player(id: string, firstName: string, lastName: string, overall = 70): Player {
  return {
    id, firstName, lastName, overall, position: 'ST',
    stats: { technical: { finition: overall }, mental: { sangFroid: overall }, physical: { vitesse: overall } },
  } as unknown as Player;
}

const HOME_PLAYERS = [player('h1', 'Marco', 'Silva', 82), player('h2', 'Jean', 'Dupont', 75)];
const AWAY_PLAYERS = [player('a1', 'Ivan', 'Petrov', 78)];

function goalEvent(id: number, minute: number, side: 'home' | 'away', playerId: string): MatchEvent {
  return { id, minute, half: minute <= 45 ? 1 : 2, type: 'goal', side, playerId, text: '' };
}

function mockState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'm1',
    status: 'fulltime',
    minute: 90, half: 2, addedTime: 0, homeAddedTime: 0, awayAddedTime: 0,
    score: { home: 0, away: 0 },
    events: [],
    shots: { home: 10, away: 10 },
    shotsOnTarget: { home: 4, away: 4 },
    xg: { home: 1, away: 1 }, saves: { home: 2, away: 2 }, passes: { home: 300, away: 300 },
    fouls: { home: 10, away: 10 }, corners: { home: 4, away: 4 }, offsides: { home: 1, away: 1 },
    freekicks: { home: 2, away: 2 }, dribbles: { home: 5, away: 5 }, clearances: { home: 5, away: 5 },
    keyPasses: { home: 3, away: 3 },
    cards: { home: { yellow: [], red: [] }, away: { yellow: [], red: [] } },
    possession: { home: 50, away: 50 }, possessionTicks: { home: 45, away: 45 },
    playerKeyPasses: {}, playerSaves: {}, playerDribbles: {}, playerClearances: {},
    ball: { x: 50, y: 50 }, speed: 'instant',
    homeOnPitch: [], awayOnPitch: [], homeBench: [], awayBench: [],
    homeAvailableBench: [], awayAvailableBench: [],
    rules: { noOffside: false, maxSubs: 5, goldenGoal: false, extraTime: false, penalties: false },
    homeSubs: 0, awaySubs: 0,
    ...overrides,
  } as MatchState;
}

const HOME = { teamId: 'team-h', players: HOME_PLAYERS };
const AWAY = { teamId: 'team-a', players: AWAY_PLAYERS };

describe('buildMatchFacts', () => {
  it('extrait buteurs, remontada et but tardif', () => {
    // Away mène 2-0, home renverse 3-2 avec but décisif à la 88e
    const state = mockState({
      score: { home: 3, away: 2 },
      events: [
        goalEvent(1, 10, 'away', 'a1'),
        goalEvent(2, 25, 'away', 'a1'),
        goalEvent(3, 40, 'home', 'h1'),
        goalEvent(4, 60, 'home', 'h1'),
        goalEvent(5, 88, 'home', 'h2'),
      ],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 'seed-1');
    expect(facts.scorers).toHaveLength(5);
    expect(facts.scorers[0]).toMatchObject({ name: 'Ivan Petrov', teamId: 'team-a', minute: 10 });
    expect(facts.comeback).toBe('home');
    expect(facts.lateWinner).toMatchObject({ name: 'Jean Dupont', minute: 88, teamId: 'team-h' });
    expect(facts.attendance).toBeGreaterThanOrEqual(12000);
    expect(facts.attendance).toBeLessThanOrEqual(80000);
    // Déterminisme
    expect(buildMatchFacts(state, HOME, AWAY, 'seed-1').attendance).toBe(facts.attendance);
  });

  it('marque les penaltys transformés et les rouges', () => {
    const state = mockState({
      score: { home: 1, away: 0 },
      events: [
        { id: 1, minute: 30, half: 1, type: 'penalty', side: 'home', text: '' },
        goalEvent(2, 30, 'home', 'h1'),
        { id: 3, minute: 70, half: 2, type: 'red', side: 'away', playerId: 'a1', text: '' },
      ],
      cards: { home: { yellow: [], red: [] }, away: { yellow: [], red: ['a1'] } },
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    expect(facts.scorers[0].penalty).toBe(true);
    expect(facts.redCards.away).toEqual([{ name: 'Ivan Petrov', minute: 70 }]);
  });
});

describe('computeMatchCotes', () => {
  it('donne une cote plus basse au plus fort', () => {
    const { home, away } = computeMatchCotes(80, 55);
    expect(home).toBeLessThan(away);
    expect(home).toBeGreaterThanOrEqual(1.01);
  });
});

describe('generateMatchPressItem — cohérence factuelle', () => {
  const snapshot = {
    homeTeamId: 'team-h', awayTeamId: 'team-a',
    homeTeamName: 'Homeland', awayTeamName: 'Awayland',
    homeScore: 3, awayScore: 2,
  };
  const baseOpts = {
    round: 3, teamId: 'team-h', teamName: 'Homeland',
    goalsFor: 3, goalsAgainst: 2, moraleBefore: 50, moraleAfter: 55,
    seed: 'coherence-seed', phase: 'league', players: HOME_PLAYERS,
    matchId: 'cm1', matchSnapshot: snapshot,
  };

  it('remontada : titre dédié + catégorie exploit', () => {
    const state = mockState({
      score: { home: 3, away: 2 },
      events: [
        goalEvent(1, 10, 'away', 'a1'), goalEvent(2, 20, 'away', 'a1'),
        goalEvent(3, 50, 'home', 'h1'), goalEvent(4, 60, 'home', 'h1'), goalEvent(5, 75, 'home', 'h2'),
      ],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const { item } = generateMatchPressItem({ ...baseOpts, facts });
    expect(item.category).toBe('exploit');
    expect(item.headline.toLowerCase()).toMatch(/remontada|renverse|revient|mené/);
  });

  it('effondrement : l\'équipe qui a gâché 2 buts d\'avance passe en crise', () => {
    const state = mockState({
      score: { home: 3, away: 2 },
      events: [
        goalEvent(1, 10, 'away', 'a1'), goalEvent(2, 20, 'away', 'a1'),
        goalEvent(3, 50, 'home', 'h1'), goalEvent(4, 60, 'home', 'h1'), goalEvent(5, 75, 'home', 'h2'),
      ],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const { item } = generateMatchPressItem({
      ...baseOpts, teamId: 'team-a', teamName: 'Awayland', goalsFor: 2, goalsAgainst: 3,
      players: AWAY_PLAYERS, facts,
    });
    expect(item.category).toBe('crise');
    expect(item.headline).toContain('Awayland');
  });

  it('doublé : le vrai buteur est cité et cliquable', () => {
    const state = mockState({
      score: { home: 2, away: 0 },
      events: [goalEvent(1, 15, 'home', 'h1'), goalEvent(2, 55, 'home', 'h1')],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const { item } = generateMatchPressItem({ ...baseOpts, goalsFor: 2, goalsAgainst: 0, facts });
    expect(item.body).toContain('Marco Silva');
    expect(item.mentions?.some((m) => m.type === 'player' && m.name === 'Marco Silva')).toBe(true);
  });

  it('outsider vainqueur : la cote apparaît dans l\'article', () => {
    const state = mockState({ score: { home: 1, away: 0 }, events: [goalEvent(1, 50, 'home', 'h1')] });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    // La bascule upset est à 80% — on cherche une seed qui la déclenche (déterministe ensuite)
    const hit = ['u1', 'u2', 'u3', 'u4', 'u5'].map((s) =>
      generateMatchPressItem({ ...baseOpts, goalsFor: 1, goalsAgainst: 0, seed: s, facts, cote: 4.5 }).item,
    ).find((it) => it.headline.includes('4.50') || it.body.includes('4.50'));
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('exploit');
  });
});

describe('generateMatchPressItem — cohérence selon le format de compétition', () => {
  const snapshot = {
    homeTeamId: 'team-h', awayTeamId: 'team-a',
    homeTeamName: 'Homeland', awayTeamName: 'Awayland',
    homeScore: 0, awayScore: 2,
  };
  const lossOpts = {
    round: 8, teamId: 'team-h', teamName: 'Homeland',
    goalsFor: 0, goalsAgainst: 2, moraleBefore: 40, moraleAfter: 35,
    players: HOME_PLAYERS, matchId: 'cm1', matchSnapshot: snapshot,
    totalTeams: 12, rank: 11,
    standing: { teamId: 'team-h', played: 8, won: 1, drawn: 1, lost: 6, goalsFor: 5, goalsAgainst: 15, points: 4 },
    isInDangerZone: true,
  };

  it('championnat pur : jamais de qualification/relégation/élimination, même « éliminé »', () => {
    for (let i = 0; i < 12; i++) {
      const { item } = generateMatchPressItem({
        ...lossOpts, seed: `league-${i}`, phase: 'league', format: 'league', isEliminated: true,
      });
      const text = (item.headline + ' ' + item.body).toLowerCase();
      expect(text).not.toMatch(/qualif|relégation|éliminé|élimination|barrage/);
    }
  });

  it('phase de groupes : le danger au classement parle de qualification', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      generateMatchPressItem({ ...lossOpts, seed: `grp-${i}`, phase: 'group', format: 'groups_knockout' }).item,
    );
    const qualifTalk = items.filter((it) => /qualification/.test(it.body.toLowerCase()));
    expect(qualifTalk.length).toBeGreaterThan(0);
    for (const it of items) {
      expect((it.headline + it.body).toLowerCase()).not.toMatch(/relégation/);
    }
  });

  it('nul en phase finale : le verdict des tirs au but est raconté', () => {
    const state = mockState({
      score: { home: 1, away: 1 },
      events: [goalEvent(1, 20, 'home', 'h1'), goalEvent(2, 70, 'away', 'a1')],
      penaltyScore: { home: 4, away: 2 },
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const win = generateMatchPressItem({
      ...lossOpts, seed: 'tab-w', phase: 'QF', format: 'cup',
      goalsFor: 1, goalsAgainst: 1, isInDangerZone: false, facts,
      matchSnapshot: { ...snapshot, homeScore: 1, awayScore: 1 },
    }).item;
    expect(win.category).toBe('victoire');
    expect(win.body).toContain('4-2 aux t.a.b.');
    const loss = generateMatchPressItem({
      ...lossOpts, teamId: 'team-a', teamName: 'Awayland', seed: 'tab-l', phase: 'QF', format: 'cup',
      goalsFor: 1, goalsAgainst: 1, isInDangerZone: false, facts, players: AWAY_PLAYERS,
      matchSnapshot: { ...snapshot, homeScore: 1, awayScore: 1 },
    }).item;
    expect(loss.category).toBe('defaite');
    expect(loss.body).toContain('2-4 aux t.a.b.');
  });
});

describe('generateRefereePressItem', () => {
  it('article arbitrage avec mention arbitre cliquable sur match à cartons', () => {
    const ref = REFEREES[0];
    const state = mockState({
      score: { home: 1, away: 1 },
      referee: ref,
      cards: { home: { yellow: ['h1', 'h2', 'x1', 'x2'], red: ['h3'] }, away: { yellow: ['a1', 'a2', 'a3'], red: [] } },
      events: [{ id: 1, minute: 60, half: 2, type: 'red', side: 'home', playerId: 'h1', text: '' }],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const snapshot = {
      homeTeamId: 'team-h', awayTeamId: 'team-a', homeTeamName: 'H', awayTeamName: 'A',
      homeScore: 1, awayScore: 1,
    };
    // 50% de déclenchement — au moins une seed sur 10 doit produire l'article
    const items = Array.from({ length: 10 }, (_, i) =>
      generateRefereePressItem({ round: 1, seed: `arb-${i}`, facts, matchId: 'm', matchSnapshot: snapshot }),
    ).filter((x) => x !== null);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it!.category).toBe('arbitrage');
      expect(it!.headline).toBeTruthy();
      expect(it!.mentions?.[0]).toMatchObject({ type: 'referee', name: ref.name });
    }
  });
});

describe('generateCmfDisciplineItem', () => {
  it('communiqué CMF sur match très haché (2 rouges)', () => {
    const state = mockState({
      cards: { home: { yellow: ['y1'], red: ['h1'] }, away: { yellow: [], red: ['a1'] } },
      events: [
        { id: 1, minute: 40, half: 1, type: 'red', side: 'home', playerId: 'h1', text: '' },
        { id: 2, minute: 80, half: 2, type: 'red', side: 'away', playerId: 'a1', text: '' },
      ],
    });
    const facts = buildMatchFacts(state, HOME, AWAY, 's');
    const items = Array.from({ length: 10 }, (_, i) =>
      generateCmfDisciplineItem({ round: 1, seed: `disc-${i}`, facts }),
    ).filter((x) => x !== null);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.category).toBe('cmf');
  });

  it('rien sur un match propre', () => {
    const facts = buildMatchFacts(mockState(), HOME, AWAY, 's');
    expect(generateCmfDisciplineItem({ round: 1, seed: 'x', facts })).toBeNull();
  });
});

describe('generateFormePressItem — méforme', () => {
  it('série de 5 défaites : article crise garanti', () => {
    const item = generateFormePressItem({
      round: 6, teamId: 't1', teamName: 'Les Nuls', winStreak: 0, lossStreak: 5, seed: 'meforme',
    });
    expect(item).not.toBeNull();
    expect(item!.category).toBe('crise');
    expect(item!.headline).toContain('Les Nuls');
  });

  // Cohérence : la compétition est terminée pour l'équipe (élimination KO / finale).
  // Le corps ne doit PAS évoquer un match ou une journée à venir.
  const CONTINUATION_RE = /prochaine? (rencontre|match)|prochaines? journées?|chaque journée qui passe|calendrier ne fera/i;

  it('méforme fin de parcours (3 défaites, competitionOver) : aucune allusion à la suite', () => {
    // lossStreak=3 déclenche à 50% → balayer plusieurs seeds pour capturer un article
    let found = false;
    for (let i = 0; i < 40; i++) {
      const item = generateFormePressItem({
        round: 4, teamId: 't1', teamName: 'Sortis', winStreak: 0, lossStreak: 3,
        competitionOver: true, seed: `over3-${i}`,
      });
      if (!item) continue;
      found = true;
      expect(item.body).not.toMatch(CONTINUATION_RE);
    }
    expect(found).toBe(true);
  });

  it('méforme fin de parcours (5 défaites, competitionOver) : aucune allusion à la suite', () => {
    const item = generateFormePressItem({
      round: 6, teamId: 't1', teamName: 'Sortis', winStreak: 0, lossStreak: 5,
      competitionOver: true, seed: 'over5',
    });
    expect(item).not.toBeNull();
    expect(item!.body).not.toMatch(CONTINUATION_RE);
  });

  it('méforme en cours (competitionOver absent) : le calendrier peut être évoqué', () => {
    // au moins un corps "en cours" mentionne la suite — vérifie qu'on n'a pas cassé la variante normale
    const item = generateFormePressItem({
      round: 6, teamId: 't1', teamName: 'Toujours là', winStreak: 0, lossStreak: 5, seed: 'meforme',
    });
    expect(item).not.toBeNull();
    expect(item!.category).toBe('crise');
  });
});

describe('barragistes LPM — % qualification par équipe', () => {
  const teamSnapshot = {
    strong: { name: 'Forte', flag: '', globalStrength: 80 },
    weak: { name: 'Faible', flag: '', globalStrength: 50 },
    a: { name: 'Alpha', flag: '', globalStrength: 65 },
    b: { name: 'Beta', flag: '', globalStrength: 65 },
  };
  const base = {
    round: 12, seed: 'barr', competitionName: 'LPM', format: 'lpm', phase: 'lpm_playoff',
    moment: 'debut' as const, teamSnapshot,
    standings: {} as Record<string, import('./types').Standing>,
    playerStats: {} as Record<string, import('./types').PlayerCompStats>,
    playoffPairs: [{ homeTeamId: 'strong', awayTeamId: 'weak' }, { homeTeamId: 'a', awayTeamId: 'b' }],
  };

  it('chaque paire somme à 100 % et le favori a le % le plus haut', () => {
    const items = generateCmfItems(base);
    const barrageItem = items.find((it) => it.cmfSnapshot?.playoffPairs && it.cmfSnapshot.playoffPairs.length > 0);
    expect(barrageItem).toBeDefined();
    const pairs = barrageItem!.cmfSnapshot!.playoffPairs!;
    expect(pairs).toHaveLength(2);
    for (const p of pairs) {
      expect(p.homeQualifyPct + p.awayQualifyPct).toBe(100);
      // plus de champ cote — remplacé par les %
      expect((p as unknown as Record<string, unknown>).cote).toBeUndefined();
    }
    const strongPair = pairs.find((p) => p.homeTeamId === 'strong')!;
    expect(strongPair.homeQualifyPct).toBeGreaterThan(strongPair.awayQualifyPct);
    // 80² / (80²+50²) ≈ 72 %
    expect(strongPair.homeQualifyPct).toBeGreaterThan(65);
  });

  it('forces égales → 50/50', () => {
    const items = generateCmfItems(base);
    const pairs = items.find((it) => it.cmfSnapshot?.playoffPairs?.length)!.cmfSnapshot!.playoffPairs!;
    const evenPair = pairs.find((p) => p.homeTeamId === 'a')!;
    expect(evenPair.homeQualifyPct).toBe(50);
    expect(evenPair.awayQualifyPct).toBe(50);
  });
});

describe('événements rares — nouveaux générateurs', () => {
  const p = player('x1', 'Nuno', 'Ferreira', 79);
  const snap = { homeTeamId: 'h', awayTeamId: 'a', homeTeamName: 'Locale', awayTeamName: 'Visiteuse', homeScore: 1, awayScore: 0 };

  it('paris truqués : catégorie scandale, mention joueur', () => {
    const item = generateFixingScandalItem({ round: 3, seed: 'fx', teamId: 'h', teamName: 'Locale', player: p, matchId: 'm', matchSnapshot: snap });
    expect(item.category).toBe('scandale');
    expect(item.body).toContain('Nuno Ferreira');
    expect(item.mentions?.[0]?.type).toBe('player');
  });

  it('bagarre vestiaire : catégorie scandale', () => {
    const item = generateLockerRoomBrawlItem({ round: 3, seed: 'br', teamId: 'h', teamName: 'Locale', player: p, matchId: 'm', matchSnapshot: snap });
    expect(item.category).toBe('scandale');
    expect(item.mentions?.[0]?.name).toBe('Nuno Ferreira');
  });

  it('discrimination : scandale + injecte les deux équipes', () => {
    const item = generateDiscriminationItem({ round: 3, seed: 'di', matchId: 'm', matchSnapshot: snap });
    expect(item.category).toBe('scandale');
    expect(item.body).toContain('Locale');
    expect(item.body).toContain('Visiteuse');
    expect(item.body).not.toContain('{homeTeam}');
  });
});

describe('communiqués CMF — nouveaux types', () => {
  it('huis_clos : injecte les équipes, catégorie cmf', () => {
    const item = generateCmfCommunique({ round: 4, seed: 'hc', type: 'huis_clos', matchSnapshot: { homeTeamId: 'h', awayTeamId: 'a', homeTeamName: 'Rouge', awayTeamName: 'Bleu', homeScore: 0, awayScore: 0 } });
    expect(item.category).toBe('cmf');
    expect(item.body).toContain('Rouge');
    expect(item.body).not.toContain('{homeTeam}');
  });

  it('palmares : injecte team + score', () => {
    const item = generateCmfCommunique({ round: 4, seed: 'pl', type: 'palmares', teamName: 'Champions', score: '6-0' });
    expect(item.category).toBe('cmf');
    expect(item.body).toContain('Champions');
    expect(item.body).toContain('6-0');
    expect(item.body).not.toContain('{team}');
    expect(item.body).not.toContain('{score}');
  });
});
