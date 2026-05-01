export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import {
  allManualPayPlans,
  generateOrderNo,
  getManualPayPlan,
  getManualPayQrUrls,
  normalizeManualPaymentMethod,
  planPublicData
} from "@/lib/manual-pay";
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
          planType?: string;
          plan?: string;
          paymentMethod?: string;
        }
      | null;
    const plan = getManualPayPlan(body?.planType || body?.plan);

    if (!plan) {
      return apiError("请选择有效套餐。");
    }

    const paymentMethod = normalizeManualPaymentMethod(body?.paymentMethod);
    const orderNo = generateOrderNo();
    const admin = createSupabaseAdminClient();
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
        payment_method: paymentMethod,
        provider: "manual_screenshot"
      })
      .select("id,order_no,plan_type,amount,credits,status,payment_method,created_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return apiSuccess({
      order,
      orderNo,
      plan: planPublicData(plan),
      plans: allManualPayPlans(),
      paymentMethod,
      qrCodes: getManualPayQrUrls(),
      instruction: "付款备注必须填写订单号，付款成功后上传付款成功截图。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建截图支付订单失败。";
    return apiError(message, 500);
  }
}
