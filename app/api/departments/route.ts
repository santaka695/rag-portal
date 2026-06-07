import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getPublicDepartments } from "@/lib/departments";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  try {
    return NextResponse.json({ departments: getPublicDepartments() });
  } catch (error) {
    console.error("Departments API error:", error);
    return NextResponse.json(
      { error: "資料カテゴリの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
