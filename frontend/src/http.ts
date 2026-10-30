// Browser and API share the deployed origin. Vite proxies /api during local development.
export const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token = await tokenProvider?.();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${apiBase}${path}`, { ...init, headers, credentials: "include" });
}
