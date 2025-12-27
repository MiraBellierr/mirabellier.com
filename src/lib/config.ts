

const RAW_API_BASE = (import.meta.env.VITE_API_BASE as string)
export const API_BASE: string = (RAW_API_BASE).replace(/\/$/, '')

export const joinApi = (path: string) => `${API_BASE}/${path.replace(/^\//, '')}`
