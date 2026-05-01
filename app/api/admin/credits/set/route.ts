import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

export async function POST(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return errorResponse(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const body = (await request.json().catch(() => null)) as { userId?: string; remaining?: number } | null;

    if (!body?.userId || typeof body.remaining !== "number" || body.remaining < 0) {
      return errorResponse("请提供有效的用户 ID 和剩余次数。");
    }

    const admin = createSupabaseAdminClient();
    const { data: current, error: fetchError } = await admin
      .from("user_credits")
      .select("total_purchased")
      .eq("user_id", body.userId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const { data, error: updateError } = await admin
      .from("user_credits")
      .upsert(
        {
          user_id: body.userId,
          remaining: Math.floor(body.remaining),
          total_purchased: Number(current?.total_purchased || 0),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("user_id,remaining,total_purchased,updated_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return apiSuccess({ credits: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改次数失败。";
    return errorResponse(message, 500);
  }
}
