import { env } from '@/lib/env';

export type ApiResult<T> = { success: true; data: T } | { success: false; error: string };

async function request<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${env.prApiUrl}/footsim${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string; message?: string };
  if (!json.success) throw new Error(json.error ?? json.message ?? `HTTP ${res.status}`);
  return json.data as T;
}

export const prapi = {
  get: <T>(path: string, token: string | null) => request<T>('GET', path, token),
  post: <T>(path: string, token: string | null, body: unknown) => request<T>('POST', path, token, body),
  put: <T>(path: string, token: string | null, body: unknown) => request<T>('PUT', path, token, body),
  del: <T>(path: string, token: string | null) => request<T>('DELETE', path, token),

  /** CMF rankings computed server-side — no auth required. */
  rankings: () =>
    request<{
      teams: {
        team: import('@/lib/types').Team;
        points: number;
        wins: number;
        finals: number;
        thirds: number;
        participations: number;
        form: ('W' | 'D' | 'L')[];
      }[];
      players: {
        id: string;
        firstName: string;
        lastName: string;
        position: string;
        overall: number;
        teamSlug: string;
        teamName: string;
        teamFlag: string | null;
      }[];
    }>('GET', '/rankings', null),

  /** Exchange a Discord access_token for a FootSim JWT. */
  exchangeDiscordToken: (discordToken: string) =>
    request<{
      token: string;
      discord_id: string;
      username: string;
      avatar: string | null;
      is_admin: boolean;
    }>('POST', '/auth/discord/exchange', null, { access_token: discordToken }),
};
