export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import {
  approveManualPaymentOrder,
  hasDuplicateScreenshotHash,
  hasDuplicateTradeNo,
} from "@/lib/manual-pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return apiError(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const body = (await request.json().catch(() => null)) as { orderId?: string; orderNo?: string } | null;

    if (!body?.orderId && !body?.orderNo) {
      return apiError("缺少订单 ID 或订单号。");
    }

    const admin = createSupabaseAdminClient();
    let query = admin
      .from("payment_orders")
      .select(
        "id,user_id,order_no,plan_type,plan,amount,credits,status,payment_method,pay_type,trade_no,extracted_trade_no,screenshot_hash,paid_at"
      );

    query = body.orderId ? query.eq("id", body.orderId) : query.eq("order_no", body.orderNo);

    const { data: order, error: orderError } = await query.maybeSingle();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return apiError("订单不存在。", 404);
    }

    if (order.status === "paid") {
      return apiSuccess({ order, alreadyPaid: true });
    }

    if (order.extracted_trade_no && (await hasDuplicateTradeNo(admin, String(order.extracted_trade_no), order.id as string))) {
      return apiError("交易单号已被其他订单使用，不能通过审核。");
    }

    if (order.screenshot_hash && (await hasDuplicateScreenshotHash(admin, String(order.screenshot_hash), order.id as string))) {
      return apiError("付款截图已被其他订单使用，不能通过审核。");
    }

    const paid = await approveManualPaymentOrder(order.id as string, admin);

    return apiSuccess({
      order: paid.order,
      alreadyPaid: paid.alreadyPaid,
      message: paid.alreadyPaid ? "订单已是 paid 状态。" : "订单已人工通过，权益已开通。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "人工通过订单失败。";
    return apiError(message, 500);
  }
}
