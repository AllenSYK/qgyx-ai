export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { applyPaidOrderBenefits, formatMoney, getEpayConfig, resolveOrderPlan, verifyEpaySign } from "@/lib/epay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function textResponse(message: "success" | "fail", status = 200) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

function paramsToObject(searchParams: URLSearchParams) {
  return Object.fromEntries(searchParams.entries());
}

export async function GET(request: NextRequest) {
  try {
    const config = getEpayConfig();

    if (!config.ready) {
      return textResponse("fail", 500);
    }

    const params = paramsToObject(request.nextUrl.searchParams);

    if (!verifyEpaySign(params, config.key)) {
      return textResponse("fail", 401);
    }

    if (params.trade_status !== "TRADE_SUCCESS") {
      return textResponse("fail");
    }

    const orderNo = params.out_trade_no;

    if (!orderNo) {
      return textResponse("fail");
    }

    const admin = createSupabaseAdminClient();
    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .select("id,user_id,order_no,plan_type,plan,amount,credits,status,pay_type,trade_no,paid_at")
      .eq("order_no", orderNo)
      .maybeSingle();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return textResponse("fail");
    }

    const plan = resolveOrderPlan(order);

    if (!plan) {
      return textResponse("fail");
    }

    const paidMoney = Number(params.money);

    if (!Number.isFinite(paidMoney) || Math.abs(paidMoney - plan.amount) > 0.001) {
      await admin
        .from("payment_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .neq("status", "paid");
      return textResponse("fail");
    }

    if (order.status === "paid") {
      return textResponse("success");
    }

    const now = new Date().toISOString();
    const { data: paidOrder, error: updateError } = await admin
      .from("payment_orders")
      .update({
        status: "paid",
        paid_at: now,
        trade_no: params.trade_no || params.api_trade_no || null,
        amount: Number(formatMoney(plan.amount)),
        updated_at: now
      })
      .eq("id", order.id)
      .neq("status", "paid")
      .select("id,user_id,order_no,plan_type,plan,amount,credits,status,pay_type,trade_no,paid_at")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!paidOrder) {
      return textResponse("success");
    }

    try {
      await applyPaidOrderBenefits(admin, paidOrder);
    } catch {
      await admin.from("payment_orders").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", paidOrder.id);
      return textResponse("fail", 500);
    }

    return textResponse("success");
  } catch {
    return textResponse("fail", 500);
  }
}
