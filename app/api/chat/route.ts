import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { searchDocuments } from "@/lib/discovery-engine";
import { generateAnswer } from "@/lib/gemini";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json(
        { error: "質問を入力してください。" },
        { status: 400 },
      );
    }

    const sources = await searchDocuments(query);
    const answer = await generateAnswer(query, sources);

    return NextResponse.json({ answer, sources });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "回答の生成に失敗しました。しばらくしてから再度お試しください。" },
      { status: 502 },
    );
  }
}
