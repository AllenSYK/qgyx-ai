export const runtime = "nodejs";

import { after } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { createJobStatusPayload, updateJobStatus } from "@/lib/analysis-jobs";
import { generateQuiz } from "@/lib/ai/generateQuiz";
import { isUsableOriginalExplanation } from "@/lib/ai/originalExplanationQuality";
import type { OriginalExplanation } from "@/lib/ai/schema";
import { getCurrentUser } from "@/lib/auth";
import { normalizeLanguage } from "@/lib/language";
import { createGenerationAllowancePayload, getGenerationAllowance } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function continueQuizGeneration(jobId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: job, error } = await admin
    .from("analysis_jobs")
    .select("id,user_id,status,detected_text,original_explanation,quiz_result,language")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !job || job.quiz_result || job.status !== "generating_quiz") {
    return;
  }

  const originalExplanation = job.original_explanation as OriginalExplanation | null;

  if (!originalExplanation || !isUsableOriginalExplanation(originalExplanation)) {
    await updateJobStatus(admin, jobId, "failed", {
      error_message: "缺少原题解析，无法继续生成 Quiz。"
    });
    return;
  }

  try {
    const quizResult = await generateQuiz({
      detectedText: String(job.detected_text || originalExplanation.detectedText),
      originalExplanation,
      subject: originalExplanation.subject,
      topic: originalExplanation.topic,
      difficulty: originalExplanation.difficulty,
      questionCount: 4,
      language: normalizeLanguage(job.language)
    });

    await updateJobStatus(admin, jobId, "completed", {
      quiz_result: quizResult,
      error_message: null
    });
  } catch (error) {
    await updateJobStatus(admin, jobId, "failed", {
      error_message: error instanceof Error ? error.message : "Quiz 后台生成失败。"
    });
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再查看任务状态。", 401);
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return apiError("缺少 jobId。");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("analysis_jobs")
      .select("id,status,progress,stage,image_url,language,detected_text,original_explanation,quiz_result,wrong_explanations,quiz_answers,pdf_url,error_message")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return apiError("任务不存在或无权访问。", 404);
    }

    if (data.status === "explanation_done" && data.original_explanation && !data.quiz_result) {
      await updateJobStatus(admin, jobId, "generating_quiz");
      const allowance = await getGenerationAllowance(admin, user.id);
      after(() => {
        void continueQuizGeneration(jobId, user.id);
      });

      return apiSuccess(
        {
          ...createJobStatusPayload({
            ...data,
            status: "generating_quiz",
            progress: 85,
            stage: "正在生成练习题"
          }),
          ...createGenerationAllowancePayload(allowance)
        }
      );
    }

    const allowance = await getGenerationAllowance(admin, user.id);

    return apiSuccess({
      ...createJobStatusPayload(data),
      ...createGenerationAllowancePayload(allowance)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取任务状态失败。";
    return apiError(message, 500);
  }
}
