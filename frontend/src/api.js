import axios from 'axios';

// Local dev (`npm run dev`) gets VITE_API_URL from the committed
// .env.development (Vite only loads that file in dev mode) — Laravel runs
// on a different port there, so calls need an absolute origin. A
// production build (`vite build`, used by the Dockerfile) doesn't load
// .env.development, so VITE_API_URL is unset and this falls back to '' —
// Laravel serves the built frontend itself in production, so a relative
// path already resolves to the right place with no origin needed.
const api = axios.create({  
    baseURL: import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin),
    withCredentials: true,
    withXSRFToken: true,
});

export default api;
