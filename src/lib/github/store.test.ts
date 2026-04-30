import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    discordClientId: 'x', discordRedirectUri: 'x',
    dataRepo: 'BJBellum/footsim-data', dataBranch: 'main',
    adminDiscordId: 'ADMIN',
  },
}));

const reads = new Map<string, { data: unknown; sha: string } | null>();
const writes: Array<{ path: string; data: unknown; sha?: string; message: string }> = [];
const lists = new Map<string, string[]>();

vi.mock('./api', () => ({
  readJson: vi.fn(async (path: string) => reads.get(path) ?? null),
  writeJson: vi.fn(async (opts: { path: string; data: unknown; sha?: string; message: string }) => {
    writes.push(opts);
    reads.set(opts.path, { data: opts.data, sha: 'newsha-' + writes.length });
    return { sha: 'newsha-' + writes.length };
  }),
  listDir: vi.fn(async (path: string) => lists.get(path) ?? []),
}));

import { saveTeamWithRoster, listTeams, loadTeam } from './store';
import type { Team, Player } from '@/lib/types';

beforeEach(() => {
  reads.clear();
  writes.length = 0;
  lists.clear();
});

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'tid', slug: 'fr', name: 'France', flag: 'data:image/png;base64,xx',
  culture: 'francais', globalStrength: 70, createdAt: '2026-04-29',
  createdBy: 'ADMIN', playerCount: 1, formation: '4-3-3',
  ...overrides,
});

const makePlayer = (id = 'p1'): Player => ({
  id, firstName: 'A', lastName: 'B', age: 24, position: 'CM',
  altPositions: [], preferredFoot: 'right',
  stats: {
    technical: { passing: 10, crossing: 10, dribbling: 10, finishing: 10, firstTouch: 10, heading: 10, longShots: 10, tackling: 10, marking: 10 },
    mental: { vision: 10, decisions: 10, composure: 10, anticipation: 10, offTheBall: 10, aggression: 10, workRate: 10 },
    physical: { pace: 10, acceleration: 10, strength: 10, stamina: 10, agility: 10, balance: 10, jumping: 10 },
    goalkeeping: null,
  },
  overall: 50,
});

describe('saveTeamWithRoster', () => {
  it('writes team.json and players.json under data/teams/{slug}', async () => {
    await saveTeamWithRoster(makeTeam(), [makePlayer()], 'tok');
    expect(writes.map((w) => w.path)).toEqual([
      'data/teams/fr/team.json',
      'data/teams/fr/players.json',
    ]);
  });

  it('reuses sha when file exists for update', async () => {
    reads.set('data/teams/fr/team.json', { data: makeTeam(), sha: 'oldsha' });
    reads.set('data/teams/fr/players.json', { data: [], sha: 'oldroster' });
    await saveTeamWithRoster(makeTeam({ name: 'Updated' }), [makePlayer()], 'tok');
    expect(writes[0].sha).toBe('oldsha');
    expect(writes[1].sha).toBe('oldroster');
  });
});

describe('listTeams', () => {
  it('returns team metadata for each subdir', async () => {
    lists.set('data/teams', ['fr', 'de']);
    reads.set('data/teams/fr/team.json', { data: makeTeam({ slug: 'fr', name: 'France' }), sha: 'a' });
    reads.set('data/teams/de/team.json', { data: makeTeam({ slug: 'de', name: 'Allemagne' }), sha: 'b' });
    const teams = await listTeams('tok');
    expect(teams.map((t) => t.slug).sort()).toEqual(['de', 'fr']);
  });
});

describe('loadTeam', () => {
  it('returns null when team.json is missing', async () => {
    expect(await loadTeam('missing', 'tok')).toBeNull();
  });
  it('returns team + players when both exist', async () => {
    reads.set('data/teams/fr/team.json', { data: makeTeam(), sha: 'a' });
    reads.set('data/teams/fr/players.json', { data: [makePlayer()], sha: 'b' });
    const out = await loadTeam('fr', 'tok');
    expect(out?.team.slug).toBe('fr');
    expect(out?.players).toHaveLength(1);
  });
});
