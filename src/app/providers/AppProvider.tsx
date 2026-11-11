import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Application-facing state (Zustand).
 * Only UI/application state lives here. Game simulation state is kept
 * strictly separate under src/game and src/simulation.
 */
export interface AppState {
  theme: 'dark' | 'neon';
  setTheme: (_theme: 'dark' | 'neon') => void;
  toggleTheme: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (_open: boolean) => void;
  version: string;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'neon' : 'dark' })),
      sidebarOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      version: '0.1.0',
    }),
    {
      name: 'aethrion-app-storage',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
