import React, { useEffect, useState } from 'react'
import darkBg from '@/assets/dark.jpg'
import lightBg from '@/assets/background.jpeg'

const STORAGE_KEY = 'miraiscute-theme'

const setDocumentDark = (isDark: boolean) => {
  try {
    const el = document.documentElement
    if (isDark) el.classList.add('dark')
    else el.classList.remove('dark')
  } catch (err) {
    console.error('DarkToggle setDocumentDark error', err)
  }
}

const DarkToggle: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(() => {
      try {
        const v = localStorage.getItem(STORAGE_KEY)
        if (v) return v === 'dark'
      } catch (err) {
        console.error('DarkToggle init localStorage error', err)
      }
    
    return false
  })

  useEffect(() => {
    setDocumentDark(isDark)
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
    } catch (err) {
      console.error('DarkToggle localStorage error', err)
    }
    try {
      const val = isDark ? `url(${darkBg})` : `url(${lightBg})`
      document.documentElement.style.setProperty('--page-bg', val)
    } catch (err) {
      console.error('DarkToggle setProperty error', err)
    }
  }, [isDark])

  return (
    <button
      aria-label="Toggle dark mode"
      onClick={() => setIsDark((s) => !s)}
      className="flex items-center space-x-2 bg-white/80 dark:bg-neutral-800/70 backdrop-blur rounded-full p-1.5 shadow-md border border-blue-100 dark:border-neutral-700"
    >
      <div className="relative w-12 h-6 flex items-center rounded-full transition-colors duration-300" >
        <div
          className={`absolute left-0 top-0 w-full h-full rounded-full ${isDark ? 'bg-gradient-to-r from-purple-700 to-blue-600' : 'bg-gradient-to-r from-pink-200 to-blue-200'}`}
        />
        <div
          className={`relative z-10 h-5 w-5 rounded-full bg-white dark:bg-neutral-900 transform transition-transform duration-300 ${isDark ? 'translate-x-6 rotate-12' : 'translate-x-0 -rotate-6'}`}
        />
      </div>
      <div className="text-sm hidden sm:block select-none">{isDark ? 'Night 🌙' : 'Day ✨'}</div>
    </button>
  )
}

export default DarkToggle
