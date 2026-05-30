import {
  isSessionActive,
  parseSessionPayload,
  splitToken,
} from "@/lib/session";

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return bytesToHex(signature);
}

export async function verifySessionTokenEdge(
  token: string,
  secret: string,
): Promise<boolean> {
  const parts = splitToken(token);
  if (!parts) {
    return false;
  }

  const payload = base64UrlDecode(parts.payloadB64);

  const expectedSignature = await signPayload(payload, secret);
  if (!timingSafeEqualHex(parts.signature, expectedSignature)) {
    return false;
  }

  const sessionPayload = parseSessionPayload(payload);
  if (!sessionPayload) {
    return false;
  }

  return isSessionActive(sessionPayload);
}
