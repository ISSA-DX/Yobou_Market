// Links to the legal pages served by the API host (server/public/*.html).
// Kept in sync across the three apps.
const API = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:4000' : '');

export const termsUrl = `${API}/terms.html`;
export const privacyUrl = `${API}/privacy.html`;
