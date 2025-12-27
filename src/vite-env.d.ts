/// <reference types="vite/client" />

declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.gif'
declare module '*.webp'
declare module '*.svg'
declare module '*.avif'
declare module '*.mp4'
declare module '*.webm'
declare module '*.mp3'

declare module '*.css'
declare module '*.scss'
declare module '*.module.css'
declare module '*.module.scss'

interface ImportMetaEnv {
	readonly VITE_API_BASE?: string
	// add other VITE_ env variables here as needed
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

