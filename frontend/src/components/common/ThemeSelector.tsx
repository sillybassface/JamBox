import { useState, useRef, useEffect } from 'react'
import { useThemeStore, THEMES } from '../../stores/themeStore'

export default function ThemeSelector() {
  const { theme, setTheme } = useThemeStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const current = THEMES.find(t => t.name === theme) ?? THEMES[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors text-sm font-label"
      >
        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>palette</span>
        <span className="hidden sm:inline">{current.label}</span>
        <span className="material-symbols-outlined text-sm">expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 py-1 w-40 bg-surface-container border border-outline-variant rounded-xl shadow-xl z-50">
          {THEMES.map(t => (
            <button
              key={t.name}
              onClick={() => { setTheme(t.name); setOpen(false) }}
              className={`w-full px-4 py-2 text-left text-sm font-label flex items-center gap-2 transition-colors ${
                theme === t.name
                  ? 'text-primary bg-primary/10'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span
                className="w-3 h-3 rounded-full border border-outline"
                style={{ backgroundColor: t.colors.primary }}
              />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}