import { create } from 'zustand';
import type { MatchInput, MatchState, Speed } from '@/lib/sim/types';
import type { Player, Team } from '@/lib/types';

export type MultiplexSlot = {
  matchId: string;
  compMatchId: string;
  home: Team;
  away: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  leg1Score?: { home: number; away: number };
  state: MatchState | null;
  finished: boolean;
  worker: Worker | null;
};

type State = {
  slots: MultiplexSlot[];
  globalSpeed: Speed;
  allFinished: boolean;
  start: (inputs: Array<{ compMatchId: string; input: MatchInput }>) => void;
  setGlobalSpeed: (speed: Speed) => void;
  pauseAll: () => void;
  resumeAll: () => void;
  stop: () => void;
};

export const useMultiplex = create<State>((set, get) => ({
  slots: [],
  globalSpeed: '1',
  allFinished: false,

  start(inputs) {
    get().stop();

    const slots: MultiplexSlot[] = inputs.map(({ compMatchId, input }) => {
      const worker = new Worker(new URL('@/lib/sim/worker.ts', import.meta.url), { type: 'module' });

      const slot: MultiplexSlot = {
        matchId: input.matchId,
        compMatchId,
        home: input.home.team,
        away: input.away.team,
        homePlayers: input.home.players,
        awayPlayers: input.away.players,
        leg1Score: input.leg1Score,
        state: null,
        finished: false,
        worker,
      };

      worker.onmessage = (ev) => {
        const msg = ev.data as
          | { type: 'state'; state: MatchState }
          | { type: 'finished'; state: MatchState }
          | { type: 'error'; message: string };

        if (msg.type === 'state' || msg.type === 'finished') {
          set((prev) => {
            const next = prev.slots.map((s) =>
              s.compMatchId === compMatchId
                ? { ...s, state: msg.state, finished: msg.type === 'finished' }
                : s,
            );
            const allFinished = next.every((s) => s.finished);
            return { slots: next, allFinished };
          });
        }
      };

      worker.postMessage({ type: 'start', input });
      return slot;
    });

    set({ slots, allFinished: false });
  },

  setGlobalSpeed(speed) {
    set({ globalSpeed: speed });
    get().slots.forEach((s) => s.worker?.postMessage({ type: 'speed', speed }));
  },

  pauseAll() {
    get().slots.forEach((s) => s.worker?.postMessage({ type: 'pause' }));
  },

  resumeAll() {
    get().slots.forEach((s) => s.worker?.postMessage({ type: 'resume' }));
  },

  stop() {
    get().slots.forEach((s) => s.worker?.terminate());
    set({ slots: [], allFinished: false });
  },
}));
