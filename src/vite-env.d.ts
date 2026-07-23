/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (anon-facing). Unset → the app runs on seed data. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key (public, RLS-guarded). Never the service-role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}
