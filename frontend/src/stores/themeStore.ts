import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeName = 'sonic-pulse' | 'opencode' | 'one-dark' | 'monokai' | 'dracula' | 'tokyo-night' | 'gruvbox' | 'midnight-jazz'

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
  {
    name: 'dracula',
    label: 'Dracula',
    colors: {
      primary: '#bd93f9',
      primary_container: '#caa8fb',
      secondary: '#ff79c6',
      tertiary: '#50fa7b',
      surface: '#282a36',
      surface_container: '#21222c',
      surface_container_high: '#2d2f3f',
      surface_container_highest: '#343746',
      surface_container_low: '#1e1f29',
      on_surface: '#f8f8f2',
      on_surface_variant: '#6272a4',
      on_primary: '#282a36',
      on_secondary: '#282a36',
      on_background: '#f8f8f2',
      background: '#282a36',
      outline: '#44475a',
      outline_variant: '#383a4a',
      error: '#ff5555',
      on_error: '#282a36',
    },
  },
  {
    name: 'tokyo-night',
    label: 'Tokyo Night',
    colors: {
      primary: '#7aa2f7',
      primary_container: '#89b4f8',
      secondary: '#bb9af7',
      tertiary: '#9ece6a',
      surface: '#1a1b26',
      surface_container: '#24283b',
      surface_container_high: '#2d3149',
      surface_container_highest: '#343b58',
      surface_container_low: '#1b1e2e',
      on_surface: '#c0caf5',
      on_surface_variant: '#565f89',
      on_primary: '#1a1b26',
      on_secondary: '#1a1b26',
      on_background: '#c0caf5',
      background: '#1a1b26',
      outline: '#414868',
      outline_variant: '#2f334d',
      error: '#f7768e',
      on_error: '#1a1b26',
    },
  },
  {
    name: 'gruvbox',
    label: 'Gruvbox',
    colors: {
      primary: '#fabd2f',
      primary_container: '#d79921',
      secondary: '#83a598',
      tertiary: '#b8bb26',
      surface: '#282828',
      surface_container: '#3c3836',
      surface_container_high: '#504945',
      surface_container_highest: '#665c54',
      surface_container_low: '#32302f',
      on_surface: '#ebdbb2',
      on_surface_variant: '#a89984',
      on_primary: '#1d2021',
      on_secondary: '#1d2021',
      on_background: '#ebdbb2',
      background: '#1d2021',
      outline: '#928374',
      outline_variant: '#504945',
      error: '#fb4934',
      on_error: '#1d2021',
    },
  },
  {
    name: 'midnight-jazz',
    label: 'Midnight Jazz',
    colors: {
      primary: '#e8b86d',
      primary_container: '#c9973a',
      secondary: '#c87c4a',
      tertiary: '#7ec8b0',
      surface: '#110e08',
      surface_container: '#1a160e',
      surface_container_high: '#221c12',
      surface_container_highest: '#2a2318',
      surface_container_low: '#0e0b06',
      on_surface: '#f0e6d3',
      on_surface_variant: '#9a8970',
      on_primary: '#1a0d00',
      on_secondary: '#1a0a00',
      on_background: '#f0e6d3',
      background: '#0c0905',
      outline: '#5a4e3a',
      outline_variant: '#3a3020',
      error: '#e05e5e',
      on_error: '#1a0000',
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