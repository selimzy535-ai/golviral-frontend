// config.js - ONLY PLACE FOR URLS
// Change URLs HERE ONLY. All HTML files use this file.

const API = 'https://golviral-api.onrender.com';
const CDN_API = 'https://golviral-cdn.onrender.com';
const CDN_URL = 'https://golviral-cdn.onrender.com';
const CDN_KEY = 'sk_live_golviral_cdn_replace_this_with_32_random_chars';
const SITE_URL = 'https://api.golviral.com'; // for profile links only, NOT for fetch()

// ===== ALIASES - So old files keep working without renaming 100 fetch calls =====
// auth.html / profile.html / post.html use these:
const DEFAULT_API = API;

// admin.html uses these:
const API_BASE = API;
const CDN_API_URL = CDN_API;
const CDN_API_KEY = CDN_KEY;
