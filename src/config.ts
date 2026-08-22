export function polarLiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POLAR_LIVE === "1";
}

export function polarAccessToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const token = env.POLAR_ACCESS_TOKEN;
  return token && token.trim() !== "" ? token : undefined;
}

export function polarWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = env.POLAR_WEBHOOK_SECRET;
  return secret && secret.trim() !== "" ? secret : undefined;
}

export function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}
