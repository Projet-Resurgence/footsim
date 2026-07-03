import { describe, expect, it } from 'vitest';
import type { SavedTactic } from '@/lib/types';
import { resolveActiveTactic, resolveMatchTactics, findCounterTactic, mergedSavedTactics, saveLocalSavedTactics } from './localTactics';

function tactic(id: string, name: string, extra: Partial<SavedTactic> = {}): SavedTactic {
  return { id, name, style: 'possession', formation: '4-3-3', lineup: [], ...extra };
}

// jsdom du setup n'expose pas un localStorage fonctionnel — mini-stub mémoire
const lsStore = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => lsStore.get(k) ?? null,
    setItem: (k: string, v: string) => { lsStore.set(k, String(v)); },
    removeItem: (k: string) => { lsStore.delete(k); },
    clear: () => lsStore.clear(),
  },
});

describe('mergedSavedTactics', () => {
  it('un cache local partiel ne masque pas les tactiques serveur', () => {
    const server = [tactic('t1', 'Base'), tactic('t2', 'Bloc bas'), tactic('t3', 'Pressing')];
    const localEdit = tactic('t2', 'Bloc bas (édité)');
    saveLocalSavedTactics('team-merge', [localEdit]);
    const merged = mergedSavedTactics({ id: 'team-merge', savedTactics: server });
    expect(merged).toHaveLength(3);
    expect(merged.find((t) => t.id === 't2')?.name).toBe('Bloc bas (édité)'); // version locale prioritaire
    expect(merged.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('les tactiques locales inédites s\'ajoutent au serveur', () => {
    saveLocalSavedTactics('team-merge2', [tactic('l1', 'Locale')]);
    const merged = mergedSavedTactics({ id: 'team-merge2', savedTactics: [tactic('t1', 'Base')] });
    expect(merged.map((t) => t.id).sort()).toEqual(['l1', 't1']);
  });

  it('sans cache local, retourne la liste serveur telle quelle', () => {
    const server = [tactic('t1', 'Base')];
    expect(mergedSavedTactics({ id: 'team-no-local', savedTactics: server })).toEqual(server);
  });
});

describe('resolveActiveTactic', () => {
  it('retourne la tactique active parmi les sauvegardées', () => {
    const t1 = tactic('t1', 'Base');
    const t2 = tactic('t2', 'Alternative', { style: 'ultra-defensif' });
    const team = { id: 'team-x', savedTactics: [t1, t2], activeTacticId: 't2' };
    expect((resolveActiveTactic(team) as SavedTactic).id).toBe('t2');
  });
});

describe('resolveMatchTactics — contre-tactiques', () => {
  const oppBase = tactic('ob', 'Pressing haut');
  const opponent = { id: 'opp-id', savedTactics: [oppBase], activeTacticId: 'ob' };

  const myBase = tactic('mb', 'Base');
  const myCounter = tactic('mc', 'Anti-pressing', {
    counterTactics: [{ teamId: 'opp-id', teamName: 'Opp', tacticId: 'ob', tacticName: 'Pressing haut' }],
  });
  const me = { id: 'me-id', savedTactics: [myBase, myCounter], activeTacticId: 'mb' };

  it('active ma contre-tactique quand l\'adversaire aligne la tactique désignée', () => {
    const { home, away } = resolveMatchTactics(me, opponent);
    expect((home as SavedTactic).id).toBe('mc');
    expect((away as SavedTactic).id).toBe('ob');
  });

  it('reste sur la tactique de base si l\'adversaire joue autre chose', () => {
    const opp2 = { ...opponent, savedTactics: [oppBase, tactic('ob2', 'Bloc bas')], activeTacticId: 'ob2' };
    const { home } = resolveMatchTactics(me, opp2);
    expect((home as SavedTactic).id).toBe('mb');
  });

  it('un override manuel de mon camp n\'est jamais écrasé, mais l\'adversaire peut le contrer', () => {
    const oppWithCounter = {
      ...opponent,
      savedTactics: [oppBase, tactic('oc', 'Contre-base', {
        counterTactics: [{ teamId: 'me-id', teamName: 'Moi', tacticId: 'mb', tacticName: 'Base' }],
      })],
    };
    const { home, away } = resolveMatchTactics(me, oppWithCounter, { home: myBase });
    expect((home as SavedTactic).id).toBe('mb'); // override conservé
    expect((away as SavedTactic).id).toBe('oc'); // l'adversaire contre mon override
  });

  it('findCounterTactic — utilisé pour la riposte en plein match', () => {
    expect(findCounterTactic(me, 'opp-id', 'ob')?.id).toBe('mc');
    expect(findCounterTactic(me, 'opp-id', 'autre')).toBeUndefined();
    expect(findCounterTactic(me, 'autre-id', 'ob')).toBeUndefined();
  });
});
