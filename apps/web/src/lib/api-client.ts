import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api/backend'; // proxied to NEXT_PUBLIC_API_URL - see next.config.js rewrites

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Access token lives in memory (Zustand), never localStorage - see
 * docs/07-SECURITY-ARCHITECTURE.md "Session Management". The refresh
 * token is an httpOnly cookie the browser sends automatically and this
 * client never touches directly.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const accessToken = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    useAuthStore.getState().clear();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
