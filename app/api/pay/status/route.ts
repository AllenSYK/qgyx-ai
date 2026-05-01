export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再查询订单。", 401);
    }

    const orderNo =
      request.nextUrl.searchParams.get("orderNo") ||
      request.nextUrl.searchParams.get("order_no") ||
      request.nextUrl.searchParams.get("out_trade_no");

    if (!orderNo) {
      return apiError("缺少订单号。");
    }

    const admin = createSupabaseAdminClient();
    const { data: order, error } = await admin
      .from("payment_orders")
      .select("id,order_no,plan_type,amount,credits,status,pay_type,trade_no,paid_at,created_at")
      .eq("order_no", orderNo)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!order) {
      return apiError("订单不存在。", 404);
    }

    return apiSuccess({
      order,
      orderNo: order.order_no,
      status: order.status || "pending"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询订单状态失败。";
    return apiError(message, 500);
  }
}
