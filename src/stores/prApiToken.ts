import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type State = {
  token: string | null;
  isAdmin: boolean;
  setToken: (token: string | null, isAdmin: boolean) => void;
  clear: () => void;
};

export const usePrApiToken = create<State>()(
  persist(
    (set) => ({
      token: null,
      isAdmin: false,
      setToken: (token, isAdmin) => set({ token, isAdmin }),
      clear: () => set({ token: null, isAdmin: false }),
    }),
    { name: 'footsim.prapi_token' },
  ),
);
