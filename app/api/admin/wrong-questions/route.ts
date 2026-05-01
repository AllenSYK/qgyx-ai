import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

export async function DELETE(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return errorResponse(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return errorResponse("缺少错题 id。");
    }

    const admin = createSupabaseAdminClient();
    const { error: deleteError } = await admin.from("wrong_questions").delete().eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除错题失败。";
    return errorResponse(message, 500);
  }
}
