export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user, isAdmin, error } = await requireAdminUser();

    if (!isAdmin || !user) {
      return apiError(error || "无权访问管理员接口。", error ? 401 : 403);
    }

    const body = (await request.json().catch(() => null)) as
      | {
          userId?: string;
          banned?: boolean;
          reason?: string | null;
        }
      | null;

    if (!body?.userId) {
      return apiError("缺少用户 ID。");
    }

    if (body.banned && body.userId === user.id) {
      return apiError("不能封禁当前管理员账号。", 400);
    }

    const admin = createSupabaseAdminClient();
    const banned = Boolean(body.banned);
    const { data, error: updateError } = await admin
      .from("profiles")
      .update({
        is_banned: banned,
        ban_reason: banned ? body.reason || "账号状态异常" : null,
        banned_at: banned ? new Date().toISOString() : null
      })
      .eq("id", body.userId)
      .select("id,email,is_banned,ban_reason,banned_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return apiSuccess({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新账号状态失败。";
    return apiError(message, 500);
  }
}
