export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { normalizeMembershipLevel } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return apiError(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const body = (await request.json().catch(() => null)) as
      | {
          userId?: string;
          membershipLevel?: string;
          membershipExpireAt?: string | null;
          addCredits?: number;
        }
      | null;

    if (!body?.userId) {
      return apiError("缺少用户 ID。");
    }

    const membershipLevel = normalizeMembershipLevel(body.membershipLevel);
    const membershipExpireAt = body.membershipExpireAt || null;
    const admin = createSupabaseAdminClient();
    const { data: profile, error: updateError } = await admin
      .from("profiles")
      .update({
        membership_level: membershipLevel,
        membership_expire_at: membershipExpireAt
      })
      .eq("id", body.userId)
      .select("id,email,role,membership_level,membership_expire_at")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (body.addCredits && body.addCredits > 0) {
      const { data: current } = await admin
        .from("user_credits")
        .select("remaining,total_purchased")
        .eq("user_id", body.userId)
        .maybeSingle();

      await admin.from("user_credits").upsert(
        {
          user_id: body.userId,
          remaining: Number(current?.remaining || 0) + Math.floor(body.addCredits),
          total_purchased: Number(current?.total_purchased || 0) + Math.floor(body.addCredits),
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
    }

    await admin.from("payment_orders").insert({
      user_id: body.userId,
      plan: membershipLevel,
      amount: 0,
      status: "paid",
      provider: "manual",
      paid_at: new Date().toISOString()
    });

    return apiSuccess({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改会员失败。";
    return apiError(message, 500);
  }
}
