// Initializes one shared Supabase client for the whole site.
// Requires config.js loaded first, and the Supabase UMD script:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SITE_CONFIG;

if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
  console.warn("Supabase is not configured yet. Edit src/js/config.js with your project URL and anon key.");
}

window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
