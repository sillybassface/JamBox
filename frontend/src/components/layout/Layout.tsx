import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import MiniPlayer from './MiniPlayer'

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 pb-20">
          <Outlet />
        </main>
      </div>
      <MiniPlayer />
    </div>
  )
}
