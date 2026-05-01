export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
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
          orderNo?: string;
          rejectReason?: string;
          reason?: string;
        }
      | null;

    if (!body?.orderId && !body?.orderNo) {
      return apiError("缺少订单 ID 或订单号。");
    }

    const rejectReason = (body.rejectReason || body.reason || "审核未通过，请联系客服处理。").trim();
    const admin = createSupabaseAdminClient();
    let query = admin
      .from("payment_orders")
      .update({
        status: "rejected",
        reject_reason: rejectReason,
        reviewed: true,
        review_result: "异常订单"
      })
      .neq("status", "paid")
      .select("id,order_no,status,reject_reason,reviewed,review_result");

    query = body.orderId ? query.eq("id", body.orderId) : query.eq("order_no", body.orderNo);

    const { data: order, error: updateError } = await query.maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!order) {
      return apiError("订单不存在或已支付，不能拒绝。", 404);
    }

    return apiSuccess({
      order,
      message: "订单已拒绝。"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "拒绝订单失败。";
    return apiError(message, 500);
  }
}
