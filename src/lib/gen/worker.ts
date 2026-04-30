import { generatePlayers, type GenerateOptions } from './players';
import type { Player } from '@/lib/types';

type Request = { id: number; opts: GenerateOptions };
type Progress = { type: 'progress'; id: number; done: number; total: number };
type Done = { type: 'done'; id: number; players: Player[] };
type ErrorMsg = { type: 'error'; id: number; message: string };

self.onmessage = (ev: MessageEvent<Request>) => {
  const { id, opts } = ev.data;
  try {
    const total = opts.count;
    const chunkSize = Math.max(50, Math.floor(total / 20));
    const players: Player[] = [];
    let done = 0;
    while (done < total) {
      const next = Math.min(chunkSize, total - done);
      players.push(...generatePlayers({ ...opts, count: next }));
      done += next;
      const progress: Progress = { type: 'progress', id, done, total };
      (self as unknown as Worker).postMessage(progress);
    }
    const msg: Done = { type: 'done', id, players };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: ErrorMsg = { type: 'error', id, message: String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
