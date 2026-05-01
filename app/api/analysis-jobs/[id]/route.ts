export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录。", 401);
    }

    const { id } = await context.params;

    if (!id) {
      return apiError("缺少任务 id。");
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("analysis_jobs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return apiError("任务不存在或无权删除。", 404);
    }

    return apiSuccess({ deleted: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除任务失败。";
    return apiError(message, 500);
  }
}

