import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { User } from '@shared/types';
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
}
const storage = {
  getItem: async (name: string): Promise<string | null> => (await get(name)) || null,
  setItem: async (name: string, value: string): Promise<void> => { await set(name, value); },
  removeItem: async (name: string): Promise<void> => { await del(name); },
};
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user, token) => {
        localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
    }),
    {
      name: 'suitewaste-auth-storage',
      storage: createJSONStorage(() => storage),
    }
  )
);