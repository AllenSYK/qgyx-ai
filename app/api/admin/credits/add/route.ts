import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
          amount?: number;
        }
      | null;

    if (!body?.userId || typeof body.amount !== "number" || body.amount <= 0) {
      return errorResponse("请提供有效的用户 ID 和增加次数。");
    }

    const amount = Math.floor(body.amount);
    const admin = createSupabaseAdminClient();
    const { data: current, error: fetchError } = await admin
      .from("user_credits")
      .select("remaining,total_purchased")
      .eq("user_id", body.userId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const nextRemaining = Number(current?.remaining || 0) + amount;
    const nextTotalPurchased = Number(current?.total_purchased || 0) + amount;
    const payload = {
      user_id: body.userId,
      remaining: nextRemaining,
      total_purchased: nextTotalPurchased,
      updated_at: new Date().toISOString()
    };

    const { data, error: updateError } = await admin
      .from("user_credits")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,remaining,total_purchased,updated_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ credits: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "增加次数失败。";
    return errorResponse(message, 500);
  }
}
