import { env } from '@/lib/env';

const API = 'https://api.github.com';

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function validatePat(token: string): Promise<boolean> {
  const res = await fetch(`${API}/user`, { headers: authHeaders(token) });
  return res.ok;
}

export async function readJson<T>(
  path: string,
  token: string,
): Promise<{ data: T; sha: string } | null> {
  const res = await fetch(
    `${API}/repos/${env.dataRepo}/contents/${path}?ref=${env.dataBranch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status}`);
  const json = (await res.json()) as { content: string; sha: string; encoding: string };
  if (json.encoding !== 'base64') throw new Error(`Unexpected encoding ${json.encoding}`);
  const text = atob(json.content.replace(/\n/g, ''));
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
  const body = {
    message: opts.message,
    content: btoa(JSON.stringify(opts.data, null, 2)),
    branch: env.dataBranch,
    ...(opts.sha ? { sha: opts.sha } : {}),
  };
  const res = await fetch(`${API}/repos/${env.dataRepo}/contents/${opts.path}`, {
    method: 'PUT',
    headers: { ...authHeaders(opts.token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub write ${opts.path}: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { content: { sha: string } };
  return { sha: json.content.sha };
}

export async function listDir(path: string, token: string): Promise<string[]> {
  const res = await fetch(
    `${API}/repos/${env.dataRepo}/contents/${path}?ref=${env.dataBranch}`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list ${path}: ${res.status}`);
  const json = (await res.json()) as Array<{ name: string; type: string }>;
  return json.filter((e) => e.type === 'dir').map((e) => e.name);
}
