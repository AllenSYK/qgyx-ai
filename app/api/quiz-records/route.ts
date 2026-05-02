import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { normalizeQuizQuestionsMath, normalizeWrongQuestionsMath } from "@/lib/quiz-math";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QuizProgressPayload } from "@/types/quiz";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再同步 Quiz 状态。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return errorResponse(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as QuizProgressPayload | null;

    if (!body || !body.sessionId || !body.quizTitle) {
      return errorResponse("Quiz 状态数据不完整。");
    }

    const admin = createSupabaseAdminClient();
    const correctCount = Math.max(0, Math.min(body.correctCount || 0, body.questionCount || 0));
    const questions = normalizeQuizQuestionsMath(body.questions || []);
    const wrongQuestions = normalizeWrongQuestionsMath(body.wrongQuestions || []);

    const { error } = await admin.from("quiz_records").upsert(
      {
        user_id: user.id,
        session_id: body.sessionId,
        analysis_record_id: body.analysisRecordId || null,
        quiz_title: body.quizTitle,
        mode: body.mode || "quiz",
        questions,
        answers: body.answers || {},
        score: body.score ?? correctCount,
        wrong_questions: wrongQuestions,
        current_index: body.currentIndex ?? 0,
        is_completed: body.isCompleted ?? false
      },
      { onConflict: "user_id,session_id" }
    );

    if (error) {
      throw new Error(error.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步 Quiz 状态失败。";
    return errorResponse(message, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再删除记录。", 401);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return errorResponse("缺少记录 id。");
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("quiz_records").delete().eq("id", id).eq("user_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除记录失败。";
    return errorResponse(message, 500);
  }
}
