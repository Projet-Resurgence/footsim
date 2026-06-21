import { env } from '@/lib/env';

const API = 'https://api.github.com';

function authHeaders(token: string | null) {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function validatePat(token: string): Promise<boolean> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  return res.ok;
}

export async function readJson<T>(
  path: string,
  token: string | null,
): Promise<{ data: T; sha: string } | null> {
  const res = await fetch(
    `${API}/repos/${env.dataRepo}/contents/${path}?ref=${env.dataBranch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status}`);
  const json = (await res.json()) as { content: string; sha: string; encoding: string };
  if (json.encoding === 'none') {
    // File too large for inline base64 — use Git Blobs API (always returns base64)
    const blobRes = await fetch(
      `${API}/repos/${env.dataRepo}/git/blobs/${json.sha}`,
      { headers: authHeaders(token) },
    );
    if (!blobRes.ok) throw new Error(`GitHub blob ${path}: ${blobRes.status}`);
    const blob = (await blobRes.json()) as { content: string; encoding: string };
    const text = base64ToUtf8(blob.content);
    return { data: JSON.parse(text) as T, sha: json.sha };
  }
  if (json.encoding !== 'base64') throw new Error(`Unexpected encoding ${json.encoding}`);
  const text = base64ToUtf8(json.content);
  return { data: JSON.parse(text) as T, sha: json.sha };
}

export type WriteOptions = {
  path: string;
  token: string;
  data: unknown;
  message: string;
  sha?: string;
};

export async function writeJson(opts: WriteOptions): Promise<{ sha: string }> {
  const content = utf8ToBase64(JSON.stringify(opts.data, null, 2));

  async function attempt(sha: string | undefined): Promise<Response> {
    return fetch(`${API}/repos/${env.dataRepo}/contents/${opts.path}`, {
      method: 'PUT',
      headers: { ...authHeaders(opts.token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: opts.message,
        content,
        branch: env.dataBranch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  let res = await attempt(opts.sha);

  // 409 = SHA stale — re-read fresh SHA and retry once
  if (res.status === 409 || res.status === 422) {
    const fresh = await readJson<unknown>(opts.path, opts.token);
    res = await attempt(fresh?.sha);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write ${opts.path}: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { content: { sha: string } };
  return { sha: json.content.sha };
}

export async function deleteFile(
  path: string,
  sha: string,
  token: string,
  message: string,
): Promise<void> {
  const res = await fetch(`${API}/repos/${env.dataRepo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: env.dataBranch }),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub delete ${path}: ${res.status} ${text}`);
  }
}

export async function listDir(path: string, token: string | null): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${env.dataRepo}/contents/${path}?ref=${env.dataBranch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list ${path}: ${res.status}`);
  const json = (await res.json()) as Array<{ name: string; type: string }>;
  return json.filter((e) => e.type === 'dir').map((e) => e.name);
}
