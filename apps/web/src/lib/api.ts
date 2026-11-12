// JSON fetch against the same-origin API (Vite proxies /api in dev). The session cookie
// travels automatically.

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return parse<T>(res);
}

/** Multipart upload; the browser sets the content type and boundary itself. */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  return parse<T>(await fetch(`/api${path}`, { method: "POST", body: form }));
}

async function parse<T>(res: Response): Promise<T> {
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : undefined;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}
