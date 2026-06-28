function need(value: string | undefined, name: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env = {
  discordClientId: need(import.meta.env.VITE_DISCORD_CLIENT_ID, 'VITE_DISCORD_CLIENT_ID'),
  discordRedirectUri: need(import.meta.env.VITE_DISCORD_REDIRECT_URI, 'VITE_DISCORD_REDIRECT_URI'),
  dataRepo: import.meta.env.VITE_DATA_REPO as string | undefined,
  dataBranch: import.meta.env.VITE_DATA_BRANCH as string | undefined,
  adminDiscordId: need(import.meta.env.VITE_ADMIN_DISCORD_ID, 'VITE_ADMIN_DISCORD_ID'),
  githubReadToken: import.meta.env.VITE_GITHUB_READ_TOKEN as string | undefined,
  prApiUrl: need(import.meta.env.VITE_PR_API_URL, 'VITE_PR_API_URL'),
};
