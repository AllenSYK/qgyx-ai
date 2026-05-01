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
    const type = searchParams.get("type");

    if (!id || (type !== "quiz" && type !== "analysis")) {
      return errorResponse("缺少记录 id 或类型。");
    }

    const admin = createSupabaseAdminClient();
    const table = type === "quiz" ? "quiz_records" : "analysis_records";
    const { error: deleteError } = await admin.from(table).delete().eq("id", id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除记录失败。";
    return errorResponse(message, 500);
  }
}
