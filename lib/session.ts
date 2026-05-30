export const SESSION_COOKIE = "rag-session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionPayload = {
  exp: number;
};

function splitToken(token: string) {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) {
    return null;
  }

  return { payloadB64, signature };
}

export function parseSessionPayload(payload: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(payload) as SessionPayload;
    if (typeof parsed.exp !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isSessionActive(payload: SessionPayload): boolean {
  return payload.exp > Date.now();
}

export { splitToken };
