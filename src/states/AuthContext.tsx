import React, { createContext, useContext, useEffect, useState } from 'react'
import { API_BASE } from '@/lib/config'

type User = {
  id: string
  username: string
  avatar?: string | null
}

type AuthContextType = {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (data: FormData) => Promise<User>
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((data) => setUser(data))
        .catch(() => { setUser(null); setToken(null); localStorage.removeItem('token') })
    }
  }, [token])

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('Login failed')
    const data = await res.json()
    setToken(data.token)
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  const register = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('Register failed')
    const data = await res.json()
    setToken(data.token)
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }

  const logout = () => {
    if (token) {
      fetch(`${API_BASE}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(()=>{})
    }
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
  }

  const updateProfile = async (formData: FormData) => {
    if (!token) throw new Error('Not authenticated')
    const res = await fetch(`${API_BASE}/me`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    if (!res.ok) throw new Error('Update failed')
    const data = await res.json()
    setUser(data)
    return data
  }

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
