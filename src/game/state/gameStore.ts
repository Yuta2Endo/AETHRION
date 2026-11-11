/**
 * Game-facing state (Zustand).
 * Holds simulation-relevant state that is NOT application/UI state.
 * Kept separate from src/app/providers/AppStore (application state).
 * Stage 01: skeleton store — no gameplay values yet.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface GameStoreState {
  empireName: string | null;
  foundedAt: number | null;
  setEmpire: (name: string) => void;
  resetEmpire: () => void;
}

export const useGameStore = create<GameStoreState>()(
  persist(
    (set) => ({
      empireName: null,
      foundedAt: null,
      setEmpire: (name) =>
        set({ empireName: name, foundedAt: name ? Date.now() : null }),
      resetEmpire: () => set({ empireName: null, foundedAt: null }),
    }),
    {
      name: 'aethrion-game-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
