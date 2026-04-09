import { useState } from 'react'
import { api } from '../../api/client'
import { useAuthStore } from '../../stores/authStore'

interface Props {
  songId: string
  isFavourite: boolean
  onToggle?: (newVal: boolean) => void
  className?: string
  /** Always visible (default) or only on hover of parent — parent must handle group */
}

export default function FavouriteButton({
  songId,
  isFavourite,
  onToggle,
  className = '',
}: Props) {
  const { user } = useAuthStore()
  const [active, setActive] = useState(isFavourite)
  const [loading, setLoading] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (!user) {
      // Flash a brief tooltip for guests
      setShowPrompt(true)
      setTimeout(() => setShowPrompt(false), 2500)
      return
    }

    if (loading) return
    setLoading(true)
    const next = !active
    try {
      if (next) await api.addFavourite(songId)
      else await api.removeFavourite(songId)
      setActive(next)
      onToggle?.(next)
    } catch {}
    finally { setLoading(false) }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        disabled={loading}
        aria-label={active ? 'Remove from favourites' : 'Add to favourites'}
        title={active ? 'Remove from favourites' : 'Add to favourites'}
        className={`transition-all duration-200 disabled:opacity-50 ${className}`}
      >
        <span
          className="material-symbols-outlined text-xl leading-none"
          style={{
            fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
            color: active ? '#ff6b9d' : undefined,
          }}
        >
          favorite
        </span>
      </button>

      {/* Guest sign-in prompt tooltip */}
      {showPrompt && (
        <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-surface-container-highest border border-white/10 text-xs font-label text-on-surface px-3 py-1.5 rounded-lg shadow-xl pointer-events-none z-50">
          <a
            href="/api/auth/login"
            className="text-primary underline pointer-events-auto"
            onClick={e => e.stopPropagation()}
          >
            Sign in
          </a>{' '}
          to save favourites
        </div>
      )}
    </div>
  )
}
