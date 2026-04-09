import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import NotificationBell from './NotificationBell'
import ThemeSelector from '../common/ThemeSelector'

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-16 bg-surface-dim/80 backdrop-blur-xl border-b border-white/5 shadow-[0_0_40px_rgba(191,90,242,0.08)]">
      <div className="flex items-center gap-8">
        <Link to="/" className="text-2xl font-bold tracking-tighter text-primary font-headline">
          Jambox
        </Link>
        <nav className="hidden md:flex gap-6 items-center">
          <Link to="/" className="text-on-surface-variant text-sm font-label hover:text-secondary transition-colors">
            Library
          </Link>
          <Link to="/favourites" className="text-on-surface-variant text-sm font-label hover:text-secondary transition-colors">
            Favourites
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <ThemeSelector />

        <button
          onClick={() => navigate('/add')}
          className="text-primary hover:text-primary-container transition-colors"
          title="Add Song"
        >
          <span className="material-symbols-outlined">add_circle</span>
        </button>

        <NotificationBell />

        {user ? (
          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary text-xs font-bold">
                {user.display_name[0]}
              </div>
            )}
            <button
              onClick={() => logout()}
              className="text-xs text-on-surface-variant hover:text-on-surface transition-colors font-label"
            >
              Sign out
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed px-5 py-2 rounded-full font-bold text-sm hover:shadow-[0_0_20px_rgba(219,144,255,0.4)] transition-all"
          >
            Sign In
          </a>
        )}
      </div>
    </header>
  )
}
