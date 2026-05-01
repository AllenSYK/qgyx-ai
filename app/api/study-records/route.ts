import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { generateWrongQuestionInsights } from "@/lib/ai";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StudyRecordPayload, WrongQuestion } from "@/types/quiz";

export const runtime = "nodejs";
export const maxDuration = 120;

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function conciseErrorType(value?: string) {
  const text = value || "";
  if (/概念|定义|公式|性质/.test(text)) return "概念没理解";
  if (/计算|算错|符号|代数/.test(text)) return "计算错误";
  if (/审题|条件|看错|漏看/.test(text)) return "审题不清";
  if (/方法|思路|不会|模型/.test(text)) return "方法不会";
  return text.slice(0, 8) || "审题不清";
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再保存学习记录。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return errorResponse(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as StudyRecordPayload | null;

    if (!body || !body.quizTitle || body.questionCount <= 0) {
      return errorResponse("学习记录数据不完整。");
    }

    const correctCount = Math.max(0, Math.min(body.correctCount, body.questionCount));
    const accuracy = Number((correctCount / body.questionCount).toFixed(4));
    const rawWrongQuestions = Array.isArray(body.wrongQuestions) ? body.wrongQuestions : [];
    const enrichedWrongQuestions: WrongQuestion[] =
      rawWrongQuestions.length > 0 ? await generateWrongQuestionInsights(rawWrongQuestions) : [];
    const knowledgePoints = uniqueStrings([
      ...(body.knowledgePoints || []),
      ...enrichedWrongQuestions.map((question) => question.knowledgePoint)
    ]);
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
        knowledge_points: knowledgePoints
      }),
      body.sessionId
        ? admin.from("quiz_records").upsert(
            {
              user_id: user.id,
              session_id: body.sessionId,
              analysis_record_id: body.analysisRecordId || null,
              quiz_title: body.quizTitle,
              mode: body.mode || "quiz",
              questions: body.questions || [],
              answers: body.answers || {},
              score: correctCount,
              wrong_questions: enrichedWrongQuestions,
              current_index: body.currentIndex ?? Math.max(0, body.questionCount - 1),
              is_completed: body.isCompleted ?? true
            },
            { onConflict: "user_id,session_id" }
          )
        : admin.from("quiz_records").insert({
            user_id: user.id,
            analysis_record_id: body.analysisRecordId || null,
            quiz_title: body.quizTitle,
            mode: body.mode || "quiz",
            questions: body.questions || [],
            answers: body.answers || {},
            score: correctCount,
            wrong_questions: enrichedWrongQuestions,
            current_index: body.currentIndex ?? Math.max(0, body.questionCount - 1),
            is_completed: body.isCompleted ?? true
          }),
      enrichedWrongQuestions.length > 0
        ? admin.from("wrong_questions").insert(
            enrichedWrongQuestions.map((question) => ({
              user_id: user.id,
              session_id: body.sessionId || null,
              question: question.question,
              options: question.options || [],
              answer_index: question.answerIndex ?? question.correctAnswerIndex ?? 0,
              user_answer_index: question.userAnswerIndex,
              explanation: question.explanation,
              knowledge_point: question.knowledgePoint,
              difficulty: question.difficulty || "medium",
              subject: question.subject || null,
              question_type: question.questionType || null,
              error_type: conciseErrorType(question.errorType),
              error_reason: question.errorReason || null,
              improvement_suggestion: question.improvementSuggestion || null,
              tags: question.tags || []
            }))
          )
        : Promise.resolve()
    ]);

    return apiSuccess({ ok: true, wrongQuestions: enrichedWrongQuestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存学习记录失败。";
    return errorResponse(message, 500);
  }
}
