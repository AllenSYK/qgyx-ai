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

    const body = (await request.json().catch(() => null)) as
      | {
          userId?: string;
          role?: "admin" | "user";
        }
      | null;

    if (!body?.userId || (body.role !== "admin" && body.role !== "user")) {
      return errorResponse("请提供有效的用户 ID 和角色。");
    }

    const admin = createSupabaseAdminClient();
    const { data, error: updateError } = await admin
      .from("profiles")
      .update({ role: body.role })
      .eq("id", body.userId)
      .select("id,email,role,created_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return apiSuccess({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改角色失败。";
    return errorResponse(message, 500);
  }
}
