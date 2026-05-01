export const runtime = "nodejs";
export const maxDuration = 300;

import { apiError, apiSuccess } from "@/lib/api-response";
import { generateOriginalExplanation } from "@/lib/ai/generateOriginalExplanation";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import type { OriginalExplanation, QuizResult } from "@/lib/ai/schema";
import { requireAdminUser } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/language";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return apiError(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const body = (await request.json().catch(() => null)) as { jobId?: string } | null;

    if (!body?.jobId) {
      return apiError("缺少 jobId。");
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error: jobError } = await admin
      .from("analysis_jobs")
      .select("id,user_id,detected_text,original_explanation,quiz_result,language")
      .eq("id", body.jobId)
      .maybeSingle();

    if (jobError) {
      throw new Error(jobError.message);
    }

    if (!job) {
      return apiError("任务不存在。", 404);
    }

    if (!job.detected_text && !job.original_explanation) {
      return apiError("该任务缺少识别文本，请用户重新上传。", 422);
    }

    let original = job.original_explanation as OriginalExplanation | null;
    let quiz = job.quiz_result as QuizResult | null;
    const language = normalizeLanguage(job.language);

    if (!original) {
      await admin
        .from("analysis_jobs")
        .update({ status: "generating_explanation", progress: 50, stage: "正在生成原题解析", error_message: null })
        .eq("id", job.id);

      original = await generateOriginalExplanation({
        detectedText: String(job.detected_text),
        imageSummary: "管理员手动重试。",
        language
      });
    }

    if (!quiz) {
      await admin
        .from("analysis_jobs")
        .update({ status: "generating_quiz", progress: 85, stage: "正在生成练习题", error_message: null, original_explanation: original })
        .eq("id", job.id);

      quiz = await generateQuiz({
        detectedText: String(job.detected_text || original.detectedText),
        originalExplanation: original,
        subject: original.subject,
        topic: original.topic,
        difficulty: original.difficulty,
        language
      });
    }

    const { data: updated, error: updateError } = await admin
      .from("analysis_jobs")
      .update({
        status: "completed",
        progress: 100,
        stage: "已完成",
        original_explanation: original,
        quiz_result: quiz,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id)
      .select("id,status,progress,stage,error_message")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return apiSuccess({ job: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "管理员重试任务失败。";
    return apiError(message, 500);
  }
}
