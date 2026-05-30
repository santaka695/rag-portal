import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  isSessionActive,
  parseSessionPayload,
  splitToken,
} from "@/lib/session";

export { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export function verifyPassword(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export function createSessionToken(secret: string): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = JSON.stringify({ exp });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const parts = splitToken(token);
  if (!parts) {
    return false;
  }

  const payload = Buffer.from(parts.payloadB64, "base64url").toString();
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  const signatureBuffer = Buffer.from(parts.signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  const sessionPayload = parseSessionPayload(payload);
  if (!sessionPayload) {
    return false;
  }

  return isSessionActive(sessionPayload);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  return verifySessionToken(token, secret);
}
