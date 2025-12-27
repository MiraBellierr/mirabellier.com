import { useAuth } from '@/states/AuthContext'

export function useOptionalAuth() {
  try {
    return useAuth()
  } catch {
    return null
  }
}
