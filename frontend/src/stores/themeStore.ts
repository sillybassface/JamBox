import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'sonic-pulse' | 'opencode' | 'one-dark' | 'monokai'

export interface Theme {
  name: ThemeName
  label: string
  colors: {
    primary: string
    primary_container: string
    secondary: string
    tertiary: string
    surface: string
    surface_container: string
    surface_container_high: string
    surface_container_highest: string
    surface_container_low: string
    on_surface: string
    on_surface_variant: string
    on_primary: string
    on_secondary: string
    on_background: string
    background: string
    outline: string
    outline_variant: string
    error: string
    on_error: string
  }
}

export const THEMES: Theme[] = [
  {
    name: 'sonic-pulse',
    label: 'Sonic Pulse',
    colors: {
      primary: '#db90ff',
      primary_container: '#d37bff',
      secondary: '#00e3fd',
      tertiary: '#ddffb0',
      surface: '#0e0e10',
      surface_container: '#19191c',
      surface_container_high: '#1f1f22',
      surface_container_highest: '#262528',
      surface_container_low: '#131315',
      on_surface: '#f6f3f5',
      on_surface_variant: '#acaaad',
      on_primary: '#4e0070',
      on_secondary: '#004d57',
      on_background: '#f6f3f5',
      background: '#0e0e10',
      outline: '#767577',
      outline_variant: '#48474a',
      error: '#ff6e84',
      on_error: '#490013',
    },
  },
  {
    name: 'opencode',
    label: 'OpenCode',
    colors: {
      primary: '#ff6b6b',
      primary_container: '#ff8787',
      secondary: '#4ecdc4',
      tertiary: '#ffe66d',
      surface: '#1a1a2e',
      surface_container: '#16213e',
      surface_container_high: '#1f2940',
      surface_container_highest: '#2a3a52',
      surface_container_low: '#0f0f1a',
      on_surface: '#eaeaea',
      on_surface_variant: '#a0a0a0',
      on_primary: '#ffffff',
      on_secondary: '#1a1a2e',
      on_background: '#eaeaea',
      background: '#1a1a2e',
      outline: '#4a5568',
      outline_variant: '#2d3748',
      error: '#ff6b6b',
      on_error: '#ffffff',
    },
  },
  {
    name: 'one-dark',
    label: 'One Dark',
    colors: {
      primary: '#c678dd',
      primary_container: '#d98fe6',
      secondary: '#61afef',
      tertiary: '#98c379',
      surface: '#282c34',
      surface_container: '#2c313a',
      surface_container_high: '#323842',
      surface_container_highest: '#3b424c',
      surface_container_low: '#21252b',
      on_surface: '#abb2bf',
      on_surface_variant: '#7f848e',
      on_primary: '#282c34',
      on_secondary: '#282c34',
      on_background: '#abb2bf',
      background: '#282c34',
      outline: '#4b5263',
      outline_variant: '#3e4451',
      error: '#e06c75',
      on_error: '#282c34',
    },
  },
  {
    name: 'monokai',
    label: 'Monokai',
    colors: {
      primary: '#f92672',
      primary_container: '#ff6b9d',
      secondary: '#66d9ef',
      tertiary: '#a6e22e',
      surface: '#272822',
      surface_container: '#3e3d32',
      surface_container_high: '#46473d',
      surface_container_highest: '#525148',
      surface_container_low: '#1f2119',
      on_surface: '#f8f8f2',
      on_surface_variant: '#90908b',
      on_primary: '#ffffff',
      on_secondary: '#272822',
      on_background: '#f8f8f2',
      background: '#272822',
      outline: '#75715e',
      outline_variant: '#49483e',
      error: '#f92672',
      on_error: '#ffffff',
    },
  },
]

interface ThemeState {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'sonic-pulse',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'jambox-theme' }
  )
)