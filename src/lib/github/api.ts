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

  // 409 = SHA stale or replication lag — wait, re-read fresh SHA, retry once
  if (res.status === 409 || res.status === 422) {
    await new Promise((r) => setTimeout(r, 500));
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

/**
 * Commit multiple file changes in a single Git commit via the low-level Trees API.
 * Each entry: { path, content } — content is the JSON-serializable data.
 */
export async function commitFiles(
  files: Array<{ path: string; content: unknown }>,
  message: string,
  token: string,
): Promise<void> {
  const repo = env.dataRepo;
  const branch = env.dataBranch;
  const h = authHeaders(token);

  // 1. Get branch HEAD SHA
  const refRes = await fetch(`${API}/repos/${repo}/git/ref/heads/${branch}`, { headers: h });
  if (!refRes.ok) throw new Error(`GitHub ref: ${refRes.status}`);
  const { object: { sha: headSha } } = await refRes.json() as { object: { sha: string } };

  // 2. Get base tree SHA
  const commitRes = await fetch(`${API}/repos/${repo}/git/commits/${headSha}`, { headers: h });
  if (!commitRes.ok) throw new Error(`GitHub commit: ${commitRes.status}`);
  const { tree: { sha: baseSha } } = await commitRes.json() as { tree: { sha: string } };

  // 3. Create blobs and build tree entries
  const treeEntries = await Promise.all(files.map(async ({ path, content }) => {
    const blobRes = await fetch(`${API}/repos/${repo}/git/blobs`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: utf8ToBase64(JSON.stringify(content, null, 2)), encoding: 'base64' }),
    });
    if (!blobRes.ok) throw new Error(`GitHub blob ${path}: ${blobRes.status}`);
    const { sha } = await blobRes.json() as { sha: string };
    return { path, mode: '100644' as const, type: 'blob' as const, sha };
  }));

  // 4. Create tree
  const treeRes = await fetch(`${API}/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
  });
  if (!treeRes.ok) throw new Error(`GitHub tree: ${treeRes.status}`);
  const { sha: treeSha } = await treeRes.json() as { sha: string };

  // 5. Create commit
  const newCommitRes = await fetch(`${API}/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: [headSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`GitHub commit create: ${newCommitRes.status}`);
  const { sha: newSha } = await newCommitRes.json() as { sha: string };

  // 6. Update branch ref
  const updateRes = await fetch(`${API}/repos/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newSha }),
  });
  if (!updateRes.ok) throw new Error(`GitHub ref update: ${updateRes.status}`);
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
