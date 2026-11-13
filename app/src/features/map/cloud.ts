/** Client side of the cloud-save API. All identity comes from the session
 * cookie; the browser never sees or stores a token. */

export interface CloudUser {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export interface CloudMapSummary {
  id: string;
  name: string;
  cols: number;
  rows: number;
  updated_at: string;
}

export interface CloudSession {
  /** False when the app is served without the auth worker (e.g. local dev). */
  supported: boolean;
  user: CloudUser | null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<CloudSession> {
  try {
    const response = await fetch("/auth/freebuff/session", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) {
      return { supported: false, user: null };
    }
    const data = await readJson<{ user: CloudUser | null }>(response);
    return { supported: true, user: data?.user ?? null };
  } catch {
    return { supported: false, user: null };
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await readJson<T & { error?: string }>(response);
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export async function listCloudMaps(): Promise<CloudMapSummary[]> {
  const data = await request<{ maps: CloudMapSummary[] }>("/api/maps");
  return data.maps ?? [];
}

export async function saveCloudMap(payload: {
  id: string;
  name: string;
  cols: number;
  rows: number;
  data: unknown;
}): Promise<void> {
  await request<{ ok: true }>(`/api/maps/${encodeURIComponent(payload.id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Returns the saved map JSON text, ready for `importMapFile`. */
export async function loadCloudMap(id: string): Promise<string> {
  const data = await request<{ map: { data: string } }>(
    `/api/maps/${encodeURIComponent(id)}`
  );
  return data.map.data;
}

export async function deleteCloudMap(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/maps/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
