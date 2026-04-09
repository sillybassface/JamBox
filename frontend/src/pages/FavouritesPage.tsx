import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Song } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { usePlayer } from '../contexts/PlayerContext'
import FavouriteButton from '../components/common/FavouriteButton'

export default function FavouritesPage() {
  const { user, loading: authLoading } = useAuthStore()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const { loadSong: setCurrentSong } = usePlayer()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }
    try {
      const data = await api.getFavourites()
      setSongs(data)
    } catch {}
    finally { setLoading(false) }
  }, [user])

  useEffect(() => { load() }, [load])

  if (authLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
    </div>
  )

  if (!user) return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <span
        className="material-symbols-outlined text-7xl text-on-surface-variant/20"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        favorite
      </span>
      <div className="text-center">
        <h2 className="font-headline text-2xl font-bold">Sign in to save favourites</h2>
        <p className="text-on-surface-variant mt-2 text-sm max-w-xs mx-auto">
          Heart songs from the library to build your personal collection.
        </p>
      </div>
      <a
        href="/api/auth/login"
        className="bg-gradient-to-r from-primary to-primary-container text-on-primary-fixed px-8 py-3 rounded-full font-bold hover:shadow-[0_0_20px_rgba(219,144,255,0.4)] transition-all"
      >
        Sign In with Google
      </a>
    </div>
  )

  const handleUnfav = (songId: string) => {
    setSongs(prev => prev.filter(s => s.id !== songId))
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <span className="text-on-surface-variant font-label text-xs tracking-[0.2em] uppercase mb-2 block">
          Your Collection
        </span>
        <h1 className="font-headline text-4xl md:text-5xl font-bold tracking-tighter text-on-surface">
          Favourites
          <span
            className="material-symbols-outlined text-[#ff6b9d] ml-3 align-middle text-4xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            favorite
          </span>
        </h1>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>
      )}

      {!loading && songs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <span
            className="material-symbols-outlined text-7xl text-on-surface-variant/20"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            favorite_border
          </span>
          <p className="text-on-surface font-headline font-bold text-lg">No favourites yet</p>
          <p className="text-on-surface-variant text-sm">
            Tap the{' '}
            <span
              className="material-symbols-outlined text-base align-middle text-[#ff6b9d]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              favorite
            </span>{' '}
            on any song in the library to save it here.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-2 text-secondary hover:underline font-label text-sm"
          >
            Browse Library →
          </button>
        </div>
      )}

      {!loading && songs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {songs.map(song => (
            <div
              key={song.id}
              className="group flex flex-col gap-3"
            >
              {/* Thumbnail */}
              <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-container-low">
                {song.thumbnail_url ? (
                  <img
                    src={song.thumbnail_url}
                    alt={song.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface-container-highest">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant">music_note</span>
                  </div>
                )}

                {/* Play overlay */}
                <div
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px] cursor-pointer"
                  onClick={() => { setCurrentSong(song); navigate(`/player/${song.id}`) }}
                >
                  <button className="w-14 h-14 rounded-full bg-primary text-on-primary-fixed flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                    <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </button>
                </div>

                {/* Heart — always visible, filled pink */}
                <div className="absolute top-2 right-2">
                  <FavouriteButton
                    songId={song.id}
                    isFavourite={true}
                    onToggle={(val) => { if (!val) handleUnfav(song.id) }}
                    className="p-1.5 rounded-full bg-black/50 text-[#ff6b9d] hover:scale-110"
                  />
                </div>
              </div>

              {/* Info */}
              <div
                className="px-1 cursor-pointer"
                onClick={() => { setCurrentSong(song); navigate(`/player/${song.id}`) }}
              >
                <h4 className="font-headline font-bold text-on-surface group-hover:text-primary transition-colors truncate text-sm">
                  {song.title}
                </h4>
                {song.artist && (
                  <p className="text-xs text-on-surface-variant font-medium truncate">{song.artist}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
