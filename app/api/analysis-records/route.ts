import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录后再删除记录。", 401);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return errorResponse("缺少记录 id。");
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("analysis_records").delete().eq("id", id).eq("user_id", user.id);

    if (error) {
      throw new Error(error.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除记录失败。";
    return errorResponse(message, 500);
  }
}
