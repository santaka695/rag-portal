import { GoogleGenAI } from "@google/genai";
import { getServerEnv } from "@/lib/env";
import type { SearchSource } from "@/lib/discovery-engine";

const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = [1000, 2000, 4000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as {
    name?: string;
    status?: number;
    code?: number;
    message?: string;
  };

  if (err.status === 503 || err.code === 503) {
    return true;
  }

  const message = typeof err.message === "string" ? err.message : "";
  return (
    message.includes('"code":503') ||
    message.includes('"status":"UNAVAILABLE"') ||
    /high demand|overloaded|try again later/i.test(message)
  );
}

function buildPrompt(
  query: string,
  sources: SearchSource[],
  departmentLabel: string,
): string {
  const context =
    sources.length > 0
      ? sources
          .map((source, index) => {
            const content =
              source.snippet.trim() ||
              "（本文スニペットは取得できませんでしたが、タイトルから関連資料です）";
            return `[${index + 1}] タイトル: ${source.title}\n内容:\n${content}`;
          })
          .join("\n\n")
      : "参照情報は見つかりませんでした。";

  return `あなたは社内マニュアルの検索アシスタントです。
以下の参照情報をもとに、質問に日本語で丁寧に回答してください。

【検索カテゴリ】
${departmentLabel}

回答ルール:
- 参照情報の「内容」に根拠がある場合は、その内容を要約して答えてください。
- タイトルが質問と一致する資料がある場合は、その資料を優先して回答してください。
- 複数資料がある場合は、最も関連性の高い資料を中心に統合してください。
- 参照情報が本当に不足している場合のみ「マニュアルに該当情報がありません」と答えてください。
- 推測で補完せず、参照情報の範囲内で回答してください。

【参照情報】
${context}

【質問】
${query}`;
}

export async function generateAnswer(
  query: string,
  sources: SearchSource[],
  departmentLabel: string,
): Promise<string> {
  const env = getServerEnv();
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const contents = buildPrompt(query, sources, departmentLabel);

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
      });

      const text = response.text?.trim();
      if (!text) {
        throw new Error("Gemini returned an empty response");
      }

      return text;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (!isRetryableGeminiError(error) || isLastAttempt) {
        throw error;
      }

      const delay = RETRY_DELAY_MS[attempt] ?? RETRY_DELAY_MS.at(-1)!;
      console.warn(
        `Gemini unavailable (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
