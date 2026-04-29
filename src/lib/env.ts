function required(name: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env = {
  discordClientId: required('VITE_DISCORD_CLIENT_ID'),
  discordRedirectUri: required('VITE_DISCORD_REDIRECT_URI'),
  dataRepo: required('VITE_DATA_REPO'),
  dataBranch: required('VITE_DATA_BRANCH'),
  adminDiscordId: required('VITE_ADMIN_DISCORD_ID'),
};
