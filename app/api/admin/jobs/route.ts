export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return apiError(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return apiError("缺少任务 id。");
    }

    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.from("analysis_jobs").delete().eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败。";
    return apiError(message, 500);
  }
}
