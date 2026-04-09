import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Song } from '../api/client'
import StatusBadge from '../components/common/StatusBadge'
import FavouriteButton from '../components/common/FavouriteButton'
import { usePlayer } from '../contexts/PlayerContext'
import { useAuthStore } from '../stores/authStore'

function SongCard({ song, isAdmin, onPlay, onDelete }: {
  song: Song
  isAdmin: boolean
  onPlay: (s: Song) => void
  onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const [isFav, setIsFav] = useState(song.is_favourite)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${song.title}"?`)) return
    setDeleting(true)
    try {
      await api.deleteSong(song.id)
      onDelete(song.id)
    } catch {
      setDeleting(false)
    }
  }

  const handleClick = () => {
    if (song.status === 'ready') {
      onPlay(song)
      navigate(`/player/${song.id}`)
    }
  }

  return (
    <div
      className={`group flex flex-col gap-3 ${song.status === 'ready' ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
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

        {/* Hover overlay */}
        {song.status === 'ready' && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
            <button className="w-14 h-14 rounded-full bg-primary text-on-primary-fixed flex items-center justify-center shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
              <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
            </button>
          </div>
        )}

        {/* Status badge (non-ready) */}
        {song.status !== 'ready' && (
          <div className="absolute bottom-2 left-2">
            <StatusBadge status={song.status} />
          </div>
        )}

        {/* Favourite button — always visible */}
        <div className="absolute top-2 right-2">
          <FavouriteButton
            songId={song.id}
            isFavourite={isFav}
            onToggle={setIsFav}
            className={`p-1.5 rounded-full transition-colors ${
              isFav
                ? 'bg-black/50 text-[#ff6b9d]'
                : 'bg-black/30 text-white/60 hover:text-[#ff6b9d] hover:bg-black/50'
            }`}
          />
        </div>

        {/* Admin delete button */}
        {isAdmin && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="absolute top-2 left-2 p-1.5 rounded-full bg-black/30 text-white/60 hover:text-error hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40"
            title="Delete song"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        )}
      </div>

      {/* Info */}
      <div className="px-1">
        <h4 className="font-headline font-bold text-on-surface group-hover:text-primary transition-colors truncate text-sm">
          {song.title}
        </h4>
        {song.artist && (
          <p className="text-xs text-on-surface-variant font-medium truncate">{song.artist}</p>
        )}
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [_error, setError] = useState<string | null>(null)
  const { loadSong } = usePlayer()
  const navigate = useNavigate()
  const isAdmin = useAuthStore(s => s.user?.is_admin ?? false)

  const load = useCallback(async () => {
    try {
      const data = await api.getSongs()
      setSongs(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Poll every 5s to update processing songs
    const iv = setInterval(load, 5000)
    return () => clearInterval(iv)
  }, [load])

  return (
    <div className="p-8 space-y-12">
      {/* Add Song hero bento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-surface-container border border-white/5 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
          <div>
            <h1 className="font-headline text-xl font-bold tracking-tighter text-on-surface">Expand Your Library</h1>
            <p className="text-on-surface-variant text-sm mt-1">Add a YouTube link to download and separate stems automatically.</p>
          </div>
          <button
            onClick={() => navigate('/add')}
            className="flex items-center gap-2 w-fit bg-secondary text-on-secondary px-5 py-2.5 rounded-xl font-headline font-bold uppercase tracking-widest text-xs hover:shadow-[0_0_20px_rgba(0,227,253,0.3)] transition-all active:scale-95"
          >
            Add Song <span className="material-symbols-outlined text-sm">add</span>
          </button>
        </div>

        <div className="p-6 rounded-2xl bg-surface-container-high border border-white/5 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-headline font-bold uppercase tracking-widest text-tertiary mb-2">Pro Tip</p>
            <p className="text-sm text-on-surface/80 leading-relaxed">
              Use solo to isolate a single instrument. Use mute to remove it entirely from the mix.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-4">
            <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-lg">tips_and_updates</span>
            </div>
            <span className="text-xs font-bold font-headline uppercase tracking-tight text-on-surface-variant">Musician Practice Hub</span>
          </div>
        </div>
      </div>

      {/* Song grid */}
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="font-headline text-2xl font-bold tracking-tighter">Library</h2>
            <p className="text-tertiary text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{songs.length} TRACKS</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
          </div>
        )}

        {!loading && songs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">music_off</span>
            <p className="text-on-surface-variant">No songs yet. Add your first song above!</p>
          </div>
        )}

        {!loading && songs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {songs.map(song => (
              <SongCard
                key={song.id}
                song={song}
                isAdmin={isAdmin}
                onPlay={loadSong}
                onDelete={(id) => setSongs(prev => prev.filter(s => s.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
