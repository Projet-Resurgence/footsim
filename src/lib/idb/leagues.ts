import type { League } from '@/lib/types';
import type { ILeagueBackend } from '@/lib/leagueBackend';

const DB_NAME = 'footsim';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      // v1 stores (idempotent)
      if (!db.objectStoreNames.contains('teams')) {
        const store = db.createObjectStore('teams', { keyPath: 'slug' });
        store.createIndex('ownerId', 'ownerId', { unique: false });
      }
      if (!db.objectStoreNames.contains('players')) {
        db.createObjectStore('players', { keyPath: 'teamSlug' });
      }
      // v2 stores
      if (!db.objectStoreNames.contains('leagues')) {
        const ls = db.createObjectStore('leagues', { keyPath: 'id' });
        ls.createIndex('nationSlug', 'nationSlug', { unique: false });
      }
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbLeagueBackend implements ILeagueBackend {
  private dbPromise = openDB();

  async listLeagues(nationSlug: string): Promise<League[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction(['leagues'], 'readonly');
      const index = t.objectStore('leagues').index('nationSlug');
      const r = index.getAll(nationSlug);
      r.onsuccess = () => resolve(r.result as League[]);
      r.onerror = () => reject(r.error);
    });
  }

  async loadLeague(id: string): Promise<League | null> {
    const db = await this.dbPromise;
    const t = db.transaction(['leagues'], 'readonly');
    const result = await req<League | undefined>(t.objectStore('leagues').get(id));
    return result ?? null;
  }

  async saveLeague(league: League): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction(['leagues'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore('leagues').put(league);
    });
  }

  async deleteLeague(id: string, _nationSlug: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction(['leagues'], 'readwrite');
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.objectStore('leagues').delete(id);
    });
  }
}
