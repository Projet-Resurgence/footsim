import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    discordClientId: 'x',
    discordRedirectUri: 'x',
    dataRepo: 'BJBellum/footsim-data',
    dataBranch: 'main',
    adminDiscordId: 'ADMIN',
  },
}));

import { validatePat, readJson, writeJson } from './api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('validatePat', () => {
  it('returns true on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await validatePat('tok')).toBe(true);
  });
  it('returns false on 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await validatePat('bad')).toBe(false);
  });
});

describe('readJson', () => {
  it('parses base64 content from contents API', async () => {
    const payload = { hello: 'world' };
    const encoded = btoa(JSON.stringify(payload));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ content: encoded, encoding: 'base64', sha: 'abc' }),
        { status: 200 },
      ),
    );
    const result = await readJson('data/teams/x/team.json', 'tok');
    expect(result).toEqual({ data: payload, sha: 'abc' });
  });
  it('returns null on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    expect(await readJson('missing.json', 'tok')).toBeNull();
  });
});

describe('writeJson', () => {
  it('sends PUT with base64-encoded JSON, message, branch, and sha when provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ content: { sha: 'newsha' } }), { status: 200 }),
      );
    const out = await writeJson({
      path: 'data/x.json',
      token: 'tok',
      data: { a: 1 },
      message: 'feat: x',
      sha: 'oldsha',
    });
    expect(out).toEqual({ sha: 'newsha' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/repos/BJBellum/footsim-data/contents/data/x.json');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(init?.body as string);
    expect(body.message).toBe('feat: x');
    expect(body.branch).toBe('main');
    expect(body.sha).toBe('oldsha');
    expect(JSON.parse(atob(body.content))).toEqual({ a: 1 });
  });
});
