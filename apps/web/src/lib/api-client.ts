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
  const res = await rawFetch(path, options);
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function rawFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = useAuthStore.getState().accessToken;
  // Multipart bodies must let the browser set the boundary header itself.
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    useAuthStore.getState().clear();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new ApiError(res.status, message ?? 'Request failed');
  }
  return res;
}

/** POSTs a single file as multipart/form-data under the "file" field (CSV import). */
export function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch<T>(path, { method: 'POST', body: form });
}

/**
 * Downloads a backend-generated export and hands it to the browser. The
 * backend builds the file (role scope, filters, filename), so the client
 * never assembles export data itself.
 */
export async function apiDownload(path: string): Promise<string> {
  const res = await rawFetch(path);
  const disposition = res.headers.get('content-disposition') ?? '';
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'smartcode-export';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return fileName;
}

/** Builds a query string, dropping empty values. */
export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return q.toString();
}
