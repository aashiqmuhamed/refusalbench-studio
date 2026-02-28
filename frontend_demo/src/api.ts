/**
 * API base URL for backend requests.
 * In development: empty string - Vite proxy handles /perturb, /verify, etc.
 * In production: set VITE_API_BASE_URL environment variable when building.
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
