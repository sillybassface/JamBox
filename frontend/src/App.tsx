import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { PlayerProvider } from './contexts/PlayerContext'
import Layout from './components/layout/Layout'
import LibraryPage from './pages/LibraryPage'
import PlayerPage from './pages/PlayerPage'
import AddSongPage from './pages/AddSongPage'
import FavouritesPage from './pages/FavouritesPage'
import { useAuthStore } from './stores/authStore'
import { ThemeProvider } from './components/providers/ThemeProvider'

function App() {
  const fetchUser = useAuthStore(s => s.fetchUser)
  useEffect(() => { fetchUser() }, [fetchUser])

  return (
    <BrowserRouter>
      <ThemeProvider>
        {/* PlayerProvider lives outside the router's page tree so navigation
            never unmounts the audio engine */}
        <PlayerProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<LibraryPage />} />
              <Route path="library" element={<LibraryPage />} />
              <Route path="favourites" element={<FavouritesPage />} />
              <Route path="add" element={<AddSongPage />} />
              <Route path="player/:songId" element={<PlayerPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </PlayerProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
