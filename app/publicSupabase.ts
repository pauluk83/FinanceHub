/**
 * Public Supabase client configuration.
 *
 * This is the publishable client key, not a service-role key: it is designed to be
 * shipped in the browser and is protected by row-level security. Keeping it in the
 * build makes the Windows installer and the hosted bundle work when CI has no .env.
 * A local .env still overrides these values.
 */
export const PUBLIC_SUPABASE_URL = "https://fzkkgbatmmgasfmgvrzp.supabase.co";
export const PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_8tJxpUDezmCxJ9MgMMPDiw_T9FS7uLW";
