import { API_BASE } from './config'

export type ImageEntry = {
  filename: string
  url: string
  size: number
  modifiedAt: string
}

export async function fetchImages(): Promise<ImageEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/images/list`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export const imageUrl = (val?: string | null) => {
  if (!val) return null
  if (val.startsWith('http')) return val
  if (val.startsWith('/')) return `${API_BASE}${val}`
  return `${API_BASE}/images/${val}`
}
