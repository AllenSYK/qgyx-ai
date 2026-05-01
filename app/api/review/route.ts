export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { generateReviewFromMistakes } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const result = await generateReviewFromMistakes({
      originalAnalysisText: body.originalAnalysisText || "",
      wrongQuestions: body.wrongQuestions || []
    });

    return apiSuccess(result);
  } catch (err) {
    console.error(err);
    return apiError("分析失败", 500);
  }
}
