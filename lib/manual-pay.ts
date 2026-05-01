import "server-only";

import crypto from "crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { robustParseAiJson } from "@/lib/ai/jsonRepair";
import { AiConfigurationError, postQwenChatCompletion, QWEN_VL_MODEL, readAssistantText, type ChatMessage } from "@/lib/ai/qwen";
import {
  PAY_PLANS,
  applyPaidOrderBenefits,
  formatMoney,
  normalizePayPlan,
  type PayPlan,
  type PayPlanType,
  type PaymentOrderRow
} from "@/lib/epay";

export type ManualPaymentMethod = "wechat" | "alipay" | "unknown";

export type ManualPayOrder = PaymentOrderRow & {
  created_at?: string | null;
  uploaded_screenshot_url?: string | null;
  extracted_amount?: number | string | null;
  extracted_paid_at?: string | null;
  ai_risk_score?: number | null;
  ai_review_result?: string | null;
  reject_reason?: string | null;
  payment_method?: ManualPaymentMethod | null;
  risk_level?: number | null;
  is_suspicious?: boolean | null;
  reviewed?: boolean | null;
  review_result?: string | null;
};

const ManualPayReviewSchema = z
  .object({
    amount: z.number().nonnegative().nullable(),
    paymentMethod: z.enum(["wechat", "alipay", "unknown"]),
    tradeNo: z.string().nullable(),
    paidAt: z.string().nullable(),
    isSuspicious: z.boolean(),
    suspiciousReasons: z.array(z.string()).default([]),
    riskScore: z.number().int().min(0).max(100),
    reviewResult: z.string(),
    rawText: z.string().default("")
  })
  .strict();

type ManualPayReview = z.infer<typeof ManualPayReviewSchema>;

const MANUAL_PAY_REVIEW_JSON_SHAPE = `{
  "amount": 3.00,
  "paymentMethod": "wechat|alipay|unknown",
  "tradeNo": "",
  "paidAt": "ISO-8601 datetime or null",
  "isSuspicious": false,
  "suspiciousReasons": [],
  "riskScore": 0,
  "reviewResult": "",
  "rawText": ""
}`;

export function normalizeManualPaymentMethod(value: unknown): ManualPaymentMethod {
  return value === "wechat" || value === "alipay" ? value : "unknown";
}

export function createManualOrderNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `QGYX${stamp}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export const generateOrderNo = createManualOrderNo;

export function hashBuffer(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export const calculateScreenshotHash = hashBuffer;

export function getManualPayQrUrls() {
  return {
    wechat: process.env.MANUAL_PAY_WECHAT_QR_URL || process.env.NEXT_PUBLIC_MANUAL_PAY_WECHAT_QR_URL || "",
    alipay: process.env.MANUAL_PAY_ALIPAY_QR_URL || process.env.NEXT_PUBLIC_MANUAL_PAY_ALIPAY_QR_URL || ""
  };
}

export function getManualPayPlan(value: unknown): PayPlan | null {
  return normalizePayPlan(value);
}

export function getManualPayPlanType(value: unknown): PayPlanType | null {
  const plan = getManualPayPlan(value);
  return plan?.type || null;
}

export function isPaidStatus(status: unknown) {
  return status === "paid";
}

export function isOrderAlreadyPaid(order: Pick<ManualPayOrder, "status"> | null | undefined) {
  return isPaidStatus(order?.status);
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePaymentText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[￥¥]/g, "¥")
    .replace(/[：]/g, ":")
    .trim();
}

export function extractPaymentAmount(text: string) {
  const normalized = normalizePaymentText(text);
  const match = normalized.match(/(?:实付|付款|支付|金额|收款|¥|￥)\s*:?\s*¥?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  return match ? Number(match[1]) : null;
}

export function extractTradeNo(text: string) {
  const normalized = normalizePaymentText(text);
  const match = normalized.match(/(?:交易单号|订单号|商户单号|支付单号|trade\s*no)\s*:?\s*([A-Za-z0-9_-]{8,64})/i);
  return match?.[1] || null;
}

export function extractPaidAt(text: string) {
  const normalized = normalizePaymentText(text);
  const match = normalized.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})[日\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function detectPaymentMethod(text: string): ManualPaymentMethod {
  const normalized = normalizePaymentText(text).toLowerCase();

  if (/微信|wechat|weixin/.test(normalized)) {
    return "wechat";
  }

  if (/支付宝|alipay/.test(normalized)) {
    return "alipay";
  }

  return "unknown";
}

function parsePaidAt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function clampRiskScore(value: number) {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function reviewPaymentScreenshotWithAI({
  base64,
  mimeType,
  orderNo,
  expectedAmount,
  createdAt
}: {
  base64: string;
  mimeType: string;
  orderNo: string;
  expectedAmount: number;
  createdAt: string;
}): Promise<ManualPayReview> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `你是支付截图 OCR 与风控审核助手。只输出 JSON，不要 Markdown，不要代码块。
你只能根据截图可见信息提取，不要编造。riskScore 0 表示极低风险，100 表示极高风险。`
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `请审核这张付款成功截图，提取金额、付款时间、交易单号、付款方式，并判断是否疑似 P 图、模糊、裁剪异常、关键信息缺失或金额异常。

后端订单信息：
- 订单号：${orderNo}
- 应付金额：${formatMoney(expectedAmount)} 元
- 订单创建时间：${createdAt}

要求：
1. 只输出 JSON。
2. amount 只填截图中的实付金额数字，无法识别填 null。
3. paidAt 尽量转成 ISO-8601 时间，无法识别填 null。
4. tradeNo 填截图中的交易单号/商户单号/微信支付单号/支付宝交易号，无法识别填 null。
5. paymentMethod 只能是 wechat、alipay、unknown。
6. 如果截图模糊、裁剪掉金额/时间/单号、疑似编辑痕迹、不是付款成功页，提升 riskScore。
7. 如果截图中看不到备注订单号，也在 suspiciousReasons 中说明。
8. rawText 填截图中能识别到的关键文字，尤其是支付状态、金额、交易单号、付款时间。

输出 JSON 格式：
${MANUAL_PAY_REVIEW_JSON_SHAPE}`
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`
          }
        }
      ]
    }
  ];

  try {
    const data = await postQwenChatCompletion({
      model: QWEN_VL_MODEL,
      messages,
      temperature: 0.1,
      enable_thinking: false,
      max_tokens: 1200
    });
    const review = await robustParseAiJson(readAssistantText(data), ManualPayReviewSchema, {
      amount: null,
      paymentMethod: "unknown",
      tradeNo: null,
      paidAt: null,
      isSuspicious: true,
      suspiciousReasons: ["AI 审核结果格式不稳定，已转入人工审核。"],
      riskScore: 80,
      reviewResult: "AI 审核结果格式不稳定，已转入人工审核。",
      rawText: ""
    });

    return {
      ...review,
      tradeNo: nullableString(review.tradeNo),
      paidAt: parsePaidAt(review.paidAt),
      riskScore: clampRiskScore(review.riskScore),
      rawText: review.rawText || review.reviewResult || ""
    };
  } catch (error) {
    const message =
      error instanceof AiConfigurationError
        ? "AI 审核未配置，已转入人工审核。"
        : error instanceof Error
          ? `AI 审核失败，已转入人工审核：${error.message}`
          : "AI 审核失败，已转入人工审核。";

    return {
      amount: null,
      paymentMethod: "unknown",
      tradeNo: null,
      paidAt: null,
      isSuspicious: true,
      suspiciousReasons: [message],
      riskScore: 80,
      reviewResult: message,
      rawText: ""
    };
  }
}

export const analyzePaymentScreenshot = reviewPaymentScreenshotWithAI;

export async function uploadPaymentProof({
  admin,
  userId,
  orderNo,
  buffer,
  mimeType,
  extension,
  screenshotHash
}: {
  admin: SupabaseClient;
  userId: string;
  orderNo: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
  screenshotHash: string;
}) {
  const bucket = process.env.SUPABASE_PAYMENT_PROOF_BUCKET || process.env.SUPABASE_UPLOAD_BUCKET || "uploads";
  const objectPath = `payment-proofs/${userId}/${orderNo}-${Date.now()}-${screenshotHash.slice(0, 12)}.${extension}`;

  const { error } = await admin.storage.from(bucket).upload(objectPath, buffer, {
    contentType: mimeType,
    upsert: false
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl || "";
}

export async function hasDuplicateScreenshotHash(admin: SupabaseClient, screenshotHash: string, orderId: string) {
  const { data, error } = await admin
    .from("payment_orders")
    .select("id,status")
    .eq("screenshot_hash", screenshotHash)
    .neq("id", orderId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function hasDuplicateTradeNo(admin: SupabaseClient, tradeNo: string | null, orderId: string) {
  if (!tradeNo) {
    return false;
  }

  const { data: extracted, error: extractedError } = await admin
    .from("payment_orders")
    .select("id,status")
    .eq("extracted_trade_no", tradeNo)
    .neq("id", orderId)
    .in("status", ["reviewing", "paid"])
    .limit(1)
    .maybeSingle();

  if (extractedError) {
    throw new Error(extractedError.message);
  }

  if (extracted) {
    return true;
  }

  const { data: paidTrade, error: paidTradeError } = await admin
    .from("payment_orders")
    .select("id,status")
    .eq("trade_no", tradeNo)
    .neq("id", orderId)
    .in("status", ["reviewing", "paid"])
    .limit(1)
    .maybeSingle();

  if (paidTradeError) {
    throw new Error(paidTradeError.message);
  }

  return Boolean(paidTrade);
}

export function evaluateManualReview({
  plan,
  order,
  review,
  duplicateTradeNo,
  duplicateScreenshotHash
}: {
  plan: PayPlan;
  order: ManualPayOrder;
  review: ManualPayReview;
  duplicateTradeNo: boolean;
  duplicateScreenshotHash: boolean;
}) {
  const extractedAmount = typeof review.amount === "number" ? review.amount : null;
  const amountMatches = extractedAmount !== null && Math.abs(extractedAmount - plan.amount) <= 0.01;
  const paidAtIso = parsePaidAt(review.paidAt);
  const paidAtMs = paidAtIso ? new Date(paidAtIso).getTime() : Number.NaN;
  const createdAtMs = order.created_at ? new Date(order.created_at).getTime() : Number.NaN;
  const paidTimeValid = Number.isFinite(paidAtMs) && Number.isFinite(createdAtMs) && paidAtMs >= createdAtMs;
  const tradeNoPresent = Boolean(nullableString(review.tradeNo));
  const successKeywordPresent = /支付成功|已完成|成功/.test(
    normalizePaymentText(`${review.rawText || ""} ${review.reviewResult || ""} ${review.suspiciousReasons.join(" ")}`)
  );
  const selectedMethod = normalizeManualPaymentMethod(order.payment_method);
  const detectedMethod = normalizeManualPaymentMethod(review.paymentMethod);
  const methodConflict = selectedMethod !== "unknown" && detectedMethod !== "unknown" && selectedMethod !== detectedMethod;
  const riskScore = clampRiskScore(review.riskScore);
  const reasons: string[] = [];

  if (!amountMatches) reasons.push("金额与订单不匹配或无法识别");
  if (!paidTimeValid) reasons.push("付款时间缺失或早于订单创建时间");
  if (!tradeNoPresent) reasons.push("交易单号缺失");
  if (duplicateTradeNo) reasons.push("交易单号已被其他订单使用");
  if (duplicateScreenshotHash) reasons.push("付款截图已被其他订单使用");
  if (!successKeywordPresent) reasons.push("OCR 文本缺少支付成功/已完成/成功关键词");
  if (methodConflict) reasons.push("用户选择的付款方式与截图识别结果不一致");
  if (review.isSuspicious) reasons.push(...review.suspiciousReasons);
  if (riskScore > 20) reasons.push(`AI 风险分 ${riskScore} 高于自动通过阈值`);
  const ruleRiskLevel = [
    duplicateTradeNo,
    duplicateScreenshotHash,
    !amountMatches,
    !successKeywordPresent
  ].filter(Boolean).length * 50;
  const isSuspicious = ruleRiskLevel > 0 || review.isSuspicious || riskScore > 20 || reasons.length > 0;

  const autoApprove = false;

  return {
    autoApprove,
    riskScore,
    riskLevel: Math.min(100, Math.max(ruleRiskLevel, isSuspicious ? 50 : 0)),
    isSuspicious,
    successKeywordPresent,
    reasons: Array.from(new Set(reasons.filter(Boolean))),
    extractedAmount,
    extractedPaidAt: paidAtIso,
    extractedTradeNo: nullableString(review.tradeNo),
    paymentMethod: methodConflict ? "unknown" : detectedMethod,
    reviewResult:
      review.reviewResult ||
      "需要人工审核。"
  };
}

export function calculatePaymentRisk(input: Parameters<typeof evaluateManualReview>[0]) {
  return evaluateManualReview(input);
}

export function canAutoApprovePayment(_order: ManualPayOrder, analysisResult: ReturnType<typeof evaluateManualReview>) {
  return false;
}

async function fetchManualOrder(admin: SupabaseClient, orderId: string) {
  const { data, error } = await admin
    .from("payment_orders")
    .select("id,user_id,order_no,plan_type,plan,amount,credits,status,payment_method,pay_type,trade_no,extracted_trade_no,paid_at,risk_level,is_suspicious,reviewed,review_result")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ManualPayOrder | null;
}

export async function approveManualPaymentOrder(orderId: string, adminOrSystem: SupabaseClient) {
  const order = await fetchManualOrder(adminOrSystem, orderId);

  if (!order) {
    throw new Error("订单不存在。");
  }

  if (order.status === "paid") {
    return {
      order,
      alreadyPaid: true,
      applied: null
    };
  }

  const now = new Date().toISOString();
  const { data: paidOrder, error } = await adminOrSystem
    .from("payment_orders")
    .update({
      status: "paid",
      paid_at: now,
      reviewed: true,
      review_result: "人工通过",
      trade_no: order.extracted_trade_no || order.trade_no || null
    })
    .eq("id", order.id)
    .neq("status", "paid")
    .select("id,user_id,order_no,plan_type,plan,amount,credits,status,payment_method,pay_type,trade_no,extracted_trade_no,paid_at,risk_level,is_suspicious,reviewed,review_result")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!paidOrder) {
    return {
      order,
      alreadyPaid: true,
      applied: null
    };
  }

  return {
    order: paidOrder,
    alreadyPaid: false,
    applied: await applyPaidOrderBenefits(adminOrSystem, paidOrder)
  };
}

export async function markManualOrderPaidOnce(admin: SupabaseClient, order: ManualPayOrder) {
  return approveManualPaymentOrder(order.id, admin);
}

export function planPublicData(plan: PayPlan) {
  return {
    planType: plan.type,
    title: plan.title,
    amount: plan.amount,
    credits: plan.credits,
    membershipDays: plan.membershipDays
  };
}

export function allManualPayPlans() {
  return Object.values(PAY_PLANS).map(planPublicData);
}
