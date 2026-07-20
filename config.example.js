// Copy to config.js and fill in from .env (Supabase dashboard → Project Settings → API).
// The anon key is designed to be public — row-level security protects the data.
// If config.js is missing, the app runs local-only with sync disabled.
window.INK_CONFIG = {
  url: 'https://your-project-ref.supabase.co',
  anonKey: 'your-anon-public-key',
};
