import { NextResponse } from "next/server";
import { AiJsonFormatError, generateReviewFromMistakes } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import type { WrongQuestion } from "@/types/quiz";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再进行错题巩固。", 401);
    }

    const body = (await request.json().catch(() => null)) as
      | {
          originalAnalysisText?: string;
          wrongQuestions?: WrongQuestion[];
        }
      | null;

    if (!body || !Array.isArray(body.wrongQuestions) || body.wrongQuestions.length === 0) {
      return errorResponse("请至少提交一道错题。");
    }

    const review = await generateReviewFromMistakes({
      originalAnalysisText: body.originalAnalysisText || "",
      wrongQuestions: body.wrongQuestions
    }).catch((error) => {
      if (error instanceof AiJsonFormatError) {
        throw new AiJsonFormatError("AI 返回格式暂时不稳定，请稍后再试。");
      }

      throw error;
    });

    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成错题巩固失败，请稍后再试。";
    const status = error instanceof AiJsonFormatError ? 502 : 500;
    return errorResponse(message, status);
  }
}
