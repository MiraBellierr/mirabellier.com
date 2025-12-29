import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOptionalAuth } from '@/hooks/use-optional-auth'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE } from '@/lib/config'
import DarkToggle from '../components/DarkToggle'

const Header = () => {
    const auth = useOptionalAuth()
    const navigate = useNavigate()
    const menuRef = useRef<HTMLDivElement | null>(null)
    const profileBtnRef = useRef<HTMLButtonElement | null>(null)
    const burgerRef = useRef<HTMLDivElement | null>(null)
    const [open, setOpen] = useState(false)
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
    const [animateIn, setAnimateIn] = useState(false)
    const [logoutConfirm, setLogoutConfirm] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        if (!menuRef.current) return
        if (!(e.target instanceof Node)) return
        if (!menuRef.current.contains(e.target)) setOpen(false)
        
        if (!burgerRef.current) return
        if (!burgerRef.current.contains(e.target)) setMobileMenuOpen(false)
      }
      document.addEventListener('click', onDoc)

      const onScroll = () => {
        setOpen(false)
        setLogoutConfirm(false)
        setMobileMenuOpen(false)
      }
      window.addEventListener('scroll', onScroll, { passive: true })

      return () => {
        document.removeEventListener('click', onDoc)
        window.removeEventListener('scroll', onScroll)
      }
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
     <header className="bg-blue-50 border-b-2 border-blue-300 dark:bg-gradient-to-r dark:from-purple-900/40 dark:to-pink-900/30 dark:border-purple-500/30 p-4 text-4xl font-bold text-blue-600 dark:text-purple-200 shadow-sm flex items-center justify-center relative">
        <h1 className="tracking-widest text-center">Welcome to my website</h1>
        
        {/* Desktop menu */}
        <div className="hidden md:flex items-center space-x-3 absolute right-4">
          <DarkToggle />
          {auth && auth.user ? (
            <div className="relative" ref={menuRef}>
              <button
                ref={profileBtnRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(o => {
                    const next = !o;
                    if (next && profileBtnRef.current) {
                      const rect = profileBtnRef.current.getBoundingClientRect();
                      const left = rect.right + window.scrollX - 176; // w-44 alignment
                      const top = rect.bottom + window.scrollY + 8;
                      setMenuPos({ top, left });
                    }
                    return next;
                  })
                }}
                className="inline-flex items-center gap-2 bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-full text-sm shadow-sm hover:scale-105 transform transition"
              >
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
              {open && createPortal(
                <div aria-hidden={!open} className={`fixed w-44 bg-white border border-blue-100 rounded-md shadow-lg z-[200000] overflow-hidden`} style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  transition: 'transform 260ms cubic-bezier(.2,1.6,.5,1), opacity 260ms ease',
                  opacity: animateIn ? 1 : 0,
                  transform: animateIn ? 'translateY(0) scale(1) translateZ(0)' : 'translateY(-6px) scale(0.98) translateZ(0)',
                  pointerEvents: open ? 'auto' : 'none',
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden'
                }}>
                  {!logoutConfirm ? (
                    <div className="flex flex-col">                    <button onClick={(e) => { e.stopPropagation(); setOpen(false); navigate('/profile') }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">👤<span>Profile</span></button>                    <button onClick={(e) => { e.stopPropagation(); setOpen(false); navigate('/settings') }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2">⚙️<span>Settings</span></button>
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
                </div>,
                document.body
              )}
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
        
        {/* Mobile burger menu */}
        <div className="md:hidden absolute right-4" ref={burgerRef}>
          <button 
            onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(o => !o) }}
            className="flex flex-col gap-1.5 bg-white/80 dark:bg-purple-900/70 backdrop-blur rounded p-2 shadow-md border border-blue-200 dark:border-purple-400/30"
            aria-label="Menu"
          >
            <span className={`block w-5 h-0.5 bg-blue-500 dark:bg-purple-300 transition-transform duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}></span>
            <span className={`block w-5 h-0.5 bg-blue-500 dark:bg-purple-300 transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} style={{ willChange: 'opacity', backfaceVisibility: 'hidden' }}></span>
            <span className={`block w-5 h-0.5 bg-blue-500 dark:bg-purple-300 transition-transform duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}></span>
          </button>
          
          {/* Mobile dropdown menu */}
          <div 
            className={`absolute right-0 mt-2 w-48 bg-white dark:bg-purple-950/95 backdrop-blur-md border border-blue-200 dark:border-purple-400/30 rounded-md shadow-lg z-[13000] overflow-hidden transition-all duration-300 ${mobileMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
          >
            <div className="flex flex-col p-2 space-y-2">
              <div className="px-2 py-2 flex items-center justify-between border-b border-blue-200 dark:border-purple-500/30">
                <span className="text-sm text-blue-600 dark:text-purple-200">Theme</span>
                <DarkToggle />
              </div>
              
              {auth && auth.user ? (
                <>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); navigate('/profile') }} 
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-purple-200 hover:bg-blue-50 dark:hover:bg-purple-800/50 rounded flex items-center gap-2"
                  >
                    <span>👤</span>
                    <span>Profile</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(false); navigate('/settings') }} 
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-purple-200 hover:bg-blue-50 dark:hover:bg-purple-800/50 rounded flex items-center gap-2"
                  >
                    <span>⚙️</span>
                    <span>Settings</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (auth?.token) { fetch(`${API_BASE}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(()=>{}) }; auth.logout(); setMobileMenuOpen(false); navigate('/') }} 
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-pink-300 hover:bg-blue-50 dark:hover:bg-purple-800/50 rounded flex items-center gap-2"
                  >
                    <span>🚪</span>
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
                  <Link 
                    to="/login" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-purple-200 hover:bg-blue-50 dark:hover:bg-purple-800/50 rounded flex items-center gap-2"
                  >
                    <span>🔐</span>
                    <span>Login</span>
                  </Link>
                  <Link 
                    to="/register" 
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-left px-3 py-2 text-sm text-pink-500 dark:text-pink-300 hover:bg-blue-50 dark:hover:bg-purple-800/50 rounded flex items-center gap-2"
                  >
                    <span>✨</span>
                    <span>Register</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
    )
}

export default Header;