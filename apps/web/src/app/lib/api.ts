const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200';

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: 'no-store', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.message || res.statusText, body?.error);
  }
  return res.json() as Promise<T>;
}

export async function apiSafe<T>(path: string, fallback: T, opts?: RequestInit): Promise<T> {
  try { return await api<T>(path, opts); } catch { return fallback; }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public error?: any) { super(message); }
}
