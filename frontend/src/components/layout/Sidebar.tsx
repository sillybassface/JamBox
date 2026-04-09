import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-[calc(100vh-4rem)] bg-surface-container-low border-r border-white/5 py-8 gap-6 sticky top-16 self-start">
      <div className="px-6">
        <h3 className="font-headline font-bold uppercase tracking-widest text-xs text-primary">Navigation</h3>
        <p className="text-on-surface-variant text-xs mt-1">Your Studio</p>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              isActive
                ? 'text-secondary bg-primary/10 border-l-2 border-secondary'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <span className="material-symbols-outlined text-xl">library_music</span>
          <span className="font-headline font-bold uppercase tracking-widest text-xs">Library</span>
        </NavLink>

        <NavLink
          to="/favourites"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              isActive
                ? 'text-secondary bg-primary/10 border-l-2 border-secondary'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <span className="material-symbols-outlined text-xl">favorite</span>
          <span className="font-headline font-bold uppercase tracking-widest text-xs">Favourites</span>
        </NavLink>
      </nav>


    </aside>
  )
}
