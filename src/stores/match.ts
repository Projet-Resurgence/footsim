import { create } from 'zustand';
import type { MatchInput, MatchState, Speed } from '@/lib/sim/types';

type State = {
  worker: Worker | null;
  state: MatchState | null;
  input: MatchInput | null;
  paused: boolean;
  finished: boolean;
  start: (input: MatchInput) => void;
  setSpeed: (speed: Speed) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  manualSub: (side: 'home' | 'away', outId: string, inId: string) => void;
};

export const useMatch = create<State>((set, get) => ({
  worker: null,
  state: null,
  input: null,
  paused: false,
  finished: false,
  start(input) {
    get().stop();
    const worker = new Worker(new URL('@/lib/sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const msg = ev.data as
        | { type: 'state'; state: MatchState }
        | { type: 'finished'; state: MatchState }
        | { type: 'error'; message: string };
      if (msg.type === 'state') set({ state: msg.state });
      else if (msg.type === 'finished') set({ state: msg.state, finished: true });
    };
    set({ worker, input, finished: false, paused: false, state: null });
    worker.postMessage({ type: 'start', input });
  },
  setSpeed(speed) {
    const w = get().worker;
    if (!w) return;
    w.postMessage({ type: 'speed', speed });
  },
  pause() {
    get().worker?.postMessage({ type: 'pause' });
    set({ paused: true });
  },
  resume() {
    get().worker?.postMessage({ type: 'resume' });
    set({ paused: false });
  },
  stop() {
    const w = get().worker;
    if (w) w.terminate();
    set({ worker: null });
  },
  reset() {
    const w = get().worker;
    if (w) w.terminate();
    set({ worker: null, state: null, input: null, finished: false, paused: false });
  },
  manualSub(side, outId, inId) {
    get().worker?.postMessage({ type: 'manualsub', side, outId, inId });
  },
}));
