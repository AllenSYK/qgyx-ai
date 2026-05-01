export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import { createOrderNo, normalizePayPlan } from "@/lib/epay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再创建订单。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as { plan?: string; planType?: string } | null;
    const plan = normalizePayPlan(body?.planType || body?.plan);

    if (!plan) {
      return apiError("请选择有效套餐。");
    }

    const admin = createSupabaseAdminClient();
    const provider = process.env.PAYMENT_PROVIDER || "manual";
    const hasPaymentKey =
      Boolean(process.env.STRIPE_SECRET_KEY) ||
      Boolean(process.env.ALIPAY_PRIVATE_KEY) ||
      Boolean(process.env.WECHATPAY_PRIVATE_KEY);

    const { data: order, error } = await admin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        order_no: createOrderNo(),
        plan_type: plan.type,
        plan: plan.membershipLevel,
        amount: plan.amount,
        credits: 0,
        status: "pending",
        provider: hasPaymentKey ? provider : "manual"
      })
      .select("id,order_no,plan_type,plan,amount,credits,status,provider,created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (!hasPaymentKey) {
      return apiSuccess({
        order,
        paymentReady: false,
        message: "当前支付通道配置中，请联系管理员开通会员。"
      });
    }

    return apiSuccess({
      order,
      paymentReady: false,
      message: "支付接口已预留，请接入具体支付网关后返回支付链接。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建支付订单失败。";
    return apiError(message, 500);
  }
}
