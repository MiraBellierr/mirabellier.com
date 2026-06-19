declare module "*.png";
declare module "*.jpg";
declare module "*.jpeg";
declare module "*.gif";
declare module "*.webp";
declare module "*.svg";
declare module "*.avif";
declare module "*.mp4";
declare module "*.webm";
declare module "*.mp3";
declare module "*?inline" {
  const src: string;
  export default src;
}

declare module "*.css";
declare module "*.scss";
declare module "*.module.css";
declare module "*.module.scss";

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_API_BASE?: string;
  readonly VITE_ANIME_STORAGE_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob<T = unknown>(
    pattern: string | readonly string[],
    options?: {
      as?: string;
      eager?: boolean;
      import?: string;
      query?: string | Record<string, string | number | boolean>;
    },
  ): Record<string, T>;
}
