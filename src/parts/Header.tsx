import { useEffect, useRef, useState } from 'react'
import { useOptionalAuth } from '@/hooks/use-optional-auth'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE } from '@/lib/config'
import DarkToggle from '../components/DarkToggle'

const Header = () => {
    const auth = useOptionalAuth()
    const navigate = useNavigate()
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [open, setOpen] = useState(false)
    const [animateIn, setAnimateIn] = useState(false)
    const [logoutConfirm, setLogoutConfirm] = useState(false)

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        if (!menuRef.current) return
        if (!(e.target instanceof Node)) return
        if (!menuRef.current.contains(e.target)) setOpen(false)
      }
      document.addEventListener('click', onDoc)

      return () => document.removeEventListener('click', onDoc)
    }, [])

    useEffect(() => {
      if (open) {
        setAnimateIn(false)
        requestAnimationFrame(() => setAnimateIn(true))
      } else {
        setAnimateIn(false)
        setLogoutConfirm(false)
      }
    }, [open])

    return (
     <header className="bg-blue-200 border-b-2 border-blue-500 dark:border-black p-4 text-4xl font-bold text-blue-700 dark:text-white shadow-sm flex items-center justify-between">
        <h1 className="tracking-widest text-center flex-1">Welcome to my website</h1>
        <div className="flex items-center space-x-3">
          <DarkToggle />
          {auth && auth.user ? (
            <div className="relative" ref={menuRef}>
              <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }} className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-full text-sm shadow-sm hover:scale-105 transform transition">
                {auth.user.avatar ? (
                  <img src={(function(){
                    const v = auth.user?.avatar
                    if (!v) return undefined
                    if (v.startsWith('blob:') || /^https?:\/\//.test(v)) return v
                    const base = API_BASE.replace(/\/$/, '')
                    return `${base}${v.startsWith('/') ? '' : '/'}${v}`
                  })()} alt="avatar" className="w-6 h-6 rounded-full" />
                ) : (
                  <span className="text-lg">😺</span>
                )}
                <span className="font-medium">{auth.user.username}</span>
              </button>
              <div aria-hidden={!open} className={`absolute right-0 mt-2 w-44 bg-white border border-blue-100 rounded-md shadow-lg z-50 overflow-hidden`} style={{
                transition: 'transform 260ms cubic-bezier(.2,1.6,.5,1), opacity 260ms ease',
                opacity: animateIn ? 1 : 0,
                transform: animateIn ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.98)',
                pointerEvents: open ? 'auto' : 'none'
              }}>
                {!logoutConfirm ? (
                  <div className="flex flex-col">
                    <button onClick={(e) => { e.stopPropagation(); setOpen(false); navigate('/profile') }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">👤<span>Profile</span></button>
                    <button onClick={(e) => { e.stopPropagation(); setLogoutConfirm(true) }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-blue-50 flex items-center gap-2">🚪<span>Logout</span></button>
                  </div>
                ) : (
                  <div className="flex flex-col p-2 space-y-2">
                    <div className="text-sm text-center text-blue-700">Confirm logout?</div>
                    <div className="flex gap-2 justify-center">
                      <button onClick={(e) => { e.stopPropagation(); if (auth?.token) { fetch(`${API_BASE}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(()=>{}) } ; auth.logout(); setOpen(false); setLogoutConfirm(false); navigate('/') }} className="text-sm px-3 py-1 bg-red-500 text-white rounded-full">Yes</button>
                      <button onClick={(e) => { e.stopPropagation(); setLogoutConfirm(false) }} className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded-full">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link to="/login" className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full text-sm shadow-sm hover:scale-105 transform transition">
                <span>🔐</span>
                <span className="font-medium">Login</span>
              </Link>
              <Link to="/register" className="inline-flex items-center gap-2 bg-pink-500 text-white px-2 py-0.5 rounded-full text-sm shadow-sm hover:scale-105 transform transition">
                <span>✨</span>
                <span className="font-medium">Register</span>
              </Link>
            </div>
          )}
        </div>
      </header>
    )
}

export default Header;