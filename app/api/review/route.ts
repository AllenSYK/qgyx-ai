export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { generateReviewFromMistakes } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const result = await generateReviewFromMistakes({
      originalAnalysisText: body.originalAnalysisText || "",
      wrongQuestions: body.wrongQuestions || []
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "分析失败" }, { status: 500 });
  }
}
