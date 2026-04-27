import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StudyRecordPayload } from "@/types/quiz";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再保存学习记录。", 401);
    }

    const body = (await request.json().catch(() => null)) as StudyRecordPayload | null;

    if (!body || !body.quizTitle || body.questionCount <= 0) {
      return errorResponse("学习记录数据不完整。");
    }

    const correctCount = Math.max(0, Math.min(body.correctCount, body.questionCount));
    const accuracy = Number((correctCount / body.questionCount).toFixed(4));
    const admin = createSupabaseAdminClient();

    await Promise.allSettled([
      body.sessionId
        ? admin
            .from("quiz_sessions")
            .update({
              correct_count: correctCount,
              accuracy
            })
            .eq("id", body.sessionId)
            .eq("user_id", user.id)
        : Promise.resolve(),
      admin.from("study_records").insert({
        user_id: user.id,
        session_id: body.sessionId || null,
        quiz_title: body.quizTitle,
        question_count: body.questionCount,
        correct_count: correctCount,
        accuracy,
        knowledge_points: body.knowledgePoints
      }),
      body.wrongQuestions.length > 0
        ? admin.from("wrong_questions").insert(
            body.wrongQuestions.map((question) => ({
              user_id: user.id,
              session_id: body.sessionId || null,
              question: question.question,
              options: question.options,
              answer_index: question.answerIndex,
              user_answer_index: question.userAnswerIndex,
              explanation: question.explanation,
              knowledge_point: question.knowledgePoint,
              difficulty: question.difficulty
            }))
          )
        : Promise.resolve()
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存学习记录失败。";
    return errorResponse(message, 500);
  }
}
