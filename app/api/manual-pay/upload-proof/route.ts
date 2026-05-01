export const runtime = "nodejs";
export const maxDuration = 120;

import { apiError, apiSuccess } from "@/lib/api-response";
import { assertUserNotBanned, getCurrentUser } from "@/lib/auth";
import {
  analyzePaymentScreenshot,
  calculatePaymentRisk,
  calculateScreenshotHash,
  getManualPayPlan,
  hasDuplicateScreenshotHash,
  hasDuplicateTradeNo,
  uploadPaymentProof,
  type ManualPayOrder
} from "@/lib/manual-pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_SCREENSHOT_SIZE = 6 * 1024 * 1024;

function getExtension(file: File) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (fromName || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return apiError("请先登录后再上传付款截图。", 401);
    }

    const bannedMessage = await assertUserNotBanned(user.id);
    if (bannedMessage) {
      return apiError(bannedMessage, 403);
    }

    const formData = await request.formData();
    const orderNo = formData.get("orderNo") || formData.get("order_no");
    const upload = formData.get("file") || formData.get("screenshot") || formData.get("proof");

    if (typeof orderNo !== "string" || !orderNo.trim()) {
      return apiError("缺少订单号。");
    }

    if (!upload || typeof upload === "string") {
      return apiError("请上传付款成功截图。");
    }

    const file = upload as File;

    if (!file.type.startsWith("image/")) {
      return apiError("付款凭证请上传图片格式。");
    }

    if (file.size > MAX_SCREENSHOT_SIZE) {
      return apiError("付款截图不能超过 6MB。");
    }

    const admin = createSupabaseAdminClient();
    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .select("id,user_id,order_no,plan_type,plan,amount,credits,status,payment_method,created_at,paid_at")
      .eq("order_no", orderNo.trim())
      .eq("user_id", user.id)
      .maybeSingle();

    if (orderError) {
      throw new Error(orderError.message);
    }

    if (!order) {
      return apiError("订单不存在。", 404);
    }

    if (order.status === "paid") {
      return apiSuccess({
        order,
        status: "paid",
        message: "订单已支付，无需重复上传。"
      });
    }

    if (order.status === "rejected") {
      return apiError("订单已被拒绝，请重新创建订单或联系客服。");
    }

    const plan = getManualPayPlan(order.plan_type || order.plan);

    if (!plan) {
      return apiError("订单套餐无效。");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const screenshotHash = calculateScreenshotHash(buffer);
    const duplicateScreenshotHash = await hasDuplicateScreenshotHash(admin, screenshotHash, order.id as string);
    const screenshotUrl = await uploadPaymentProof({
      admin,
      userId: user.id,
      orderNo: order.order_no as string,
      buffer,
      mimeType: file.type || "image/png",
      extension: getExtension(file),
      screenshotHash
    });

    const aiReview = await analyzePaymentScreenshot({
      base64: buffer.toString("base64"),
      mimeType: file.type || "image/png",
      orderNo: order.order_no as string,
      expectedAmount: plan.amount,
      createdAt: String(order.created_at)
    });
    const duplicateTradeNo = await hasDuplicateTradeNo(admin, aiReview.tradeNo, order.id as string);
    const evaluation = calculatePaymentRisk({
      plan,
      order: order as ManualPayOrder,
      review: aiReview,
      duplicateTradeNo,
      duplicateScreenshotHash
    });
    const reviewText = [
      evaluation.reviewResult,
      evaluation.reasons.length ? `原因：${evaluation.reasons.join("；")}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    const { data: updatedOrder, error: updateError } = await admin
      .from("payment_orders")
      .update({
        status: "reviewing",
        uploaded_screenshot_url: screenshotUrl,
        screenshot_hash: duplicateScreenshotHash ? null : screenshotHash,
        extracted_amount: evaluation.extractedAmount,
        extracted_trade_no: duplicateTradeNo ? null : evaluation.extractedTradeNo,
        extracted_paid_at: evaluation.extractedPaidAt,
        payment_method: evaluation.paymentMethod,
        ai_risk_score: evaluation.riskScore,
        ai_review_result: reviewText,
        risk_level: evaluation.riskLevel,
        is_suspicious: evaluation.isSuspicious,
        reviewed: false,
        review_result: null,
        reject_reason: null
      })
      .eq("id", order.id)
      .neq("status", "paid")
      .select(
        "id,order_no,plan_type,plan,amount,credits,status,payment_method,extracted_amount,extracted_trade_no,extracted_paid_at,reject_reason,created_at,paid_at"
      )
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return apiSuccess({
      order: updatedOrder,
      status: "reviewing",
      message: "付款已提交，请联系客服确认后开通",
      contact: "微信：15155132939"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传付款截图失败。";
    return apiError(message, 500);
  }
}
