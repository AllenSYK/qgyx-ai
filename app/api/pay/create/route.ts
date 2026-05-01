export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import {
  buildEpayPaymentUrl,
  createOrderNo,
  getEpayConfig,
  normalizePayPlan,
  normalizePayType
} from "@/lib/epay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再创建支付订单。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const body = (await request.json().catch(() => null)) as
      | {
          plan?: string;
          planType?: string;
          payType?: string;
          pay_type?: string;
        }
      | null;
    const plan = normalizePayPlan(body?.planType || body?.plan);

    if (!plan) {
      return apiError("请选择有效套餐。");
    }

    const payType = normalizePayType(body?.payType || body?.pay_type);
    const orderNo = createOrderNo();
    const admin = createSupabaseAdminClient();
    const provider = "epay";
    const legacyPlan = plan.membershipLevel;
    const { data: order, error } = await admin
      .from("payment_orders")
      .insert({
        user_id: user.id,
        order_no: orderNo,
        plan_type: plan.type,
        plan: legacyPlan,
        amount: plan.amount,
        credits: 0,
        status: "pending",
        pay_type: payType,
        provider
      })
      .select("id,user_id,order_no,plan_type,amount,credits,status,pay_type,created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const paymentUrl = buildEpayPaymentUrl({ orderNo, plan, payType });
    const epayConfig = getEpayConfig();

    if (!epayConfig.ready || !paymentUrl) {
      return apiSuccess({
        order,
        orderNo,
        payment_url: null,
        paymentUrl: null,
        paymentReady: false,
        message: "当前支付通道配置中，请联系管理员开通会员或充值次数。"
      });
    }

    return apiSuccess({
      order,
      orderNo,
      payment_url: paymentUrl,
      paymentUrl,
      paymentReady: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建支付订单失败。";
    return apiError(message, 500);
  }
}
