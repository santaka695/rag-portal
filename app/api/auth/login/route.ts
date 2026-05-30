import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSessionToken,
  getSessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { getAppPassword, getAuthSecret } from "@/lib/env";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? "";

    if (!verifyPassword(password, getAppPassword())) {
      return NextResponse.json(
        { error: "パスワードが正しくありません。" },
        { status: 401 },
      );
    }

    const token = createSessionToken(getAuthSecret());
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, getSessionCookieOptions());

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "サーバー設定が不完全です。" },
      { status: 500 },
    );
  }
}
