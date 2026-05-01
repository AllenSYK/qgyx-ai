export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { applyPaidOrderBenefits, resolveOrderPlan } from "@/lib/epay";
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
          orderId?: string;
          membershipExpireAt?: string | null;
        }
      | null;

    if (!body?.orderId) {
      return apiError("缺少订单 ID。");
    }

    const admin = createSupabaseAdminClient();
    const { data: existingOrder, error: existingError } = await admin
      .from("payment_orders")
      .select("id,user_id,order_no,plan_type,plan,amount,credits,status,pay_type,trade_no,paid_at")
      .eq("id", body.orderId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existingOrder) {
      return apiError("订单不存在。", 404);
    }

    if (existingOrder.status === "paid") {
      return apiSuccess({ order: existingOrder, alreadyPaid: true });
    }

    if (!existingOrder.plan_type && (existingOrder.plan === "pro" || existingOrder.plan === "premium" || existingOrder.plan === "max")) {
      const membershipLevel = normalizeMembershipLevel(existingOrder.plan);
      const expireAt = body.membershipExpireAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: order, error: orderError } = await admin
        .from("payment_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", body.orderId)
        .neq("status", "paid")
        .select("id,user_id,order_no,plan_type,plan,amount,credits,status,pay_type,trade_no,paid_at")
        .single();

      if (orderError) {
        throw new Error(orderError.message);
      }

      await admin
        .from("profiles")
        .update({
          membership_level: membershipLevel,
          membership_expire_at: expireAt
        })
        .eq("id", order.user_id);

      return apiSuccess({ order, membershipLevel, membershipExpireAt: expireAt });
    }

    const plan = resolveOrderPlan(existingOrder);

    if (!plan) {
      return apiError("订单套餐无效。");
    }

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", body.orderId)
      .neq("status", "paid")
      .select("id,user_id,order_no,plan_type,plan,amount,credits,status,pay_type,trade_no,paid_at")
      .single();

    if (orderError) {
      throw new Error(orderError.message);
    }

    const applied = await applyPaidOrderBenefits(admin, {
      ...order,
      credits: plan.credits,
      plan_type: plan.type
    });
    const expireAt = applied.membership?.membership_expire_at || body.membershipExpireAt || null;

    return apiSuccess({
      order,
      planType: plan.type,
      creditsAdded: applied.credits?.remaining ? plan.credits : 0,
      membershipExpireAt: expireAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "标记订单失败。";
    return apiError(message, 500);
  }
}
