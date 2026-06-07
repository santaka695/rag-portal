function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getServerEnv() {
  return {
    gcpProjectId: requireEnv("GCP_PROJECT_ID"),
    discoveryEngineLocation: requireEnv("DISCOVERY_ENGINE_LOCATION"),
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    appPassword: requireEnv("APP_PASSWORD"),
    authSecret: requireEnv("AUTH_SECRET"),
    googleCredentialsJson: requireEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON"),
  };
}

export function getAuthSecret(): string {
  return requireEnv("AUTH_SECRET");
}

export function getAppPassword(): string {
  return requireEnv("APP_PASSWORD");
}
