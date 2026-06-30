import type { Player, Team } from '@/lib/types';
import type { ITeamBackend } from '@/lib/backend';

const DB_NAME = 'footsim';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('teams')) {
        const store = db.createObjectStore('teams', { keyPath: 'slug' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('players')) {
        db.createObjectStore('players', { keyPath: 'teamSlug' });
      }
      if (!db.objectStoreNames.contains('leagues')) {
        const ls = db.createObjectStore('leagues', { keyPath: 'id' });
        ls.createIndex('nationSlug', 'nationSlug', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    t.onerror = () => reject(t.error);
    const result = fn(t);
    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      result.then(resolve).catch(reject);
    }
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbTeamBackend implements ITeamBackend {
  private dbPromise = openDB();

  async listTeams(ownerId: string): Promise<Team[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction(['teams'], 'readonly');
      const index = t.objectStore('teams').index('ownerId');
      const r = index.getAll(ownerId);
      r.onsuccess = () => resolve(r.result as Team[]);
      r.onerror = () => reject(r.error);
    });
  }

  async loadTeam(slug: string, ownerId: string): Promise<{ team: Team; players: Player[] } | null> {
    const db = await this.dbPromise;
    const t = db.transaction(['teams', 'players'], 'readonly');
    const teamReq = t.objectStore('teams').get(slug);
    const playersReq = t.objectStore('players').get(slug);

    const [team, playersRow] = await Promise.all([req(teamReq), req(playersReq)]) as [Team | undefined, { teamSlug: string; players: Player[] } | undefined];

    if (!team || team.ownerId !== ownerId) return null;
    return { team, players: playersRow?.players ?? [] };
  }

  async saveTeam(team: Team, players: Player[]): Promise<Team> {
    const db = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(['teams', 'players'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore('teams').put(team);
      t.objectStore('players').put({ teamSlug: team.slug, players });
    });
    return team;
  }

  async deleteTeam(slug: string, ownerId: string): Promise<void> {
    const db = await this.dbPromise;
    const team = await tx<Team | undefined>(db, ['teams'], 'readonly', (t) =>
      t.objectStore('teams').get(slug),
    );
    if (!team || team.ownerId !== ownerId) return;

    return new Promise((resolve, reject) => {
      const t = db.transaction(['teams', 'players'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore('teams').delete(slug);
      t.objectStore('players').delete(slug);
    });
  }
}
