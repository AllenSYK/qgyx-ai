export const runtime = "nodejs";
export const maxDuration = 180;

import { apiError, apiSuccess } from "@/lib/api-response";
import { createAnalysisPdf } from "@/lib/pdf-export";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { getGenerationAllowance } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再导出 PDF。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as { jobId?: string } | null;

    if (!body?.jobId) {
      return apiError("缺少 jobId。");
    }

    const admin = createSupabaseAdminClient();
    const { data: job, error } = await admin
      .from("analysis_jobs")
      .select("id,user_id,language,original_explanation,quiz_result,quiz_answers,wrong_explanations,created_at")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!job?.original_explanation) {
      return apiError("任务尚未生成原题解析，暂时无法导出。", 409);
    }

    const membership = await getGenerationAllowance(admin, user.id);
    const hasWatermark = membership.membershipLevel === "free";
    const pdfBytes = await createAnalysisPdf({
      job: {
        id: job.id as string,
        original_explanation: job.original_explanation,
        quiz_result: job.quiz_result,
        quiz_answers: job.quiz_answers,
        wrong_explanations: job.wrong_explanations,
        language: job.language,
        created_at: job.created_at
      },
      watermark: hasWatermark
    });
    const filename = `qgyx-ai-${String(job.id).slice(0, 8)}.pdf`;

    await Promise.allSettled([
      admin
        .from("analysis_jobs")
        .update({
          pdf_url: `generated:${new Date().toISOString()}`,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id)
        .eq("user_id", user.id),
      admin.from("ai_usage_logs").insert({
        user_id: user.id,
        job_id: job.id,
        action: "export_pdf",
        status: "success",
        tokens_used: 0,
        total_tokens: 0,
        model: "pdf-lib"
      })
    ]);

    return apiSuccess({
      filename,
      mimeType: "application/pdf",
      hasWatermark,
      base64: Buffer.from(pdfBytes).toString("base64")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出 PDF 失败。";
    return apiError(message, 500);
  }
}
