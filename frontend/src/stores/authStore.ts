import { create } from 'zustand'
import { api, User } from '../api/client'

interface AuthState {
  user: User | null
  loading: boolean
  fetchUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    set({ loading: true })
    try {
      const user = await api.me()
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  logout: async () => {
    await api.logout()
    set({ user: null })
  },
}))
