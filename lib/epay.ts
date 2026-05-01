import "server-only";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMBERSHIP_PLANS,
  normalizeMembershipPlan,
  type MembershipPlan,
  type MembershipPlanType,
  type PaidMembershipLevel
} from "@/lib/membership-plans";

export type PayPlanType = MembershipPlanType;
export type EpayPayType = "alipay" | "wechat";
export type PayPlan = MembershipPlan;

export const PAY_PLANS = MEMBERSHIP_PLANS;

export type PaymentOrderRow = {
  id: string;
  user_id: string;
  order_no?: string | null;
  plan_type?: string | null;
  plan?: string | null;
  amount?: number | string | null;
  credits?: number | null;
  status?: string | null;
  pay_type?: string | null;
  payment_method?: string | null;
  trade_no?: string | null;
  extracted_trade_no?: string | null;
  screenshot_hash?: string | null;
  risk_level?: number | null;
  is_suspicious?: boolean | null;
  reviewed?: boolean | null;
  review_result?: string | null;
  paid_at?: string | null;
};

export function normalizePayPlan(value: unknown): PayPlan | null {
  return normalizeMembershipPlan(value);
}

export function normalizePayType(value: unknown): EpayPayType {
  return value === "wechat" ? "wechat" : "alipay";
}

export function createOrderNo() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  return `QGYX${timestamp}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export function formatMoney(amount: number) {
  return amount.toFixed(2);
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://qgyx.asia").replace(/\/+$/, "");
}

export function getEpayConfig() {
  const pid = process.env.EPAY_PID || "";
  const key = process.env.EPAY_KEY || "";
  const gateway = process.env.EPAY_GATEWAY || "";

  return {
    pid,
    key,
    gateway,
    ready: Boolean(pid && key && gateway)
  };
}

function normalizeGateway(gateway: string) {
  const trimmed = gateway.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith(".php") ? trimmed : `${trimmed}/submit.php`;
}

export function createEpaySign(params: Record<string, unknown>, key: string) {
  const signText = Object.entries(params)
    .filter(([name, value]) => name !== "sign" && name !== "sign_type" && value !== undefined && value !== null && String(value) !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");

  return crypto.createHash("md5").update(`${signText}${key}`, "utf8").digest("hex").toLowerCase();
}

export function verifyEpaySign(params: Record<string, unknown>, key: string) {
  const received = typeof params.sign === "string" ? params.sign.toLowerCase() : "";
  const expected = createEpaySign(params, key);

  if (!received || received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export function buildEpayPaymentUrl({
  orderNo,
  plan,
  payType
}: {
  orderNo: string;
  plan: PayPlan;
  payType: EpayPayType;
}) {
  const config = getEpayConfig();

  if (!config.ready) {
    return null;
  }

  const siteUrl = getSiteUrl();
  const params: Record<string, string> = {
    pid: config.pid,
    type: payType,
    out_trade_no: orderNo,
    notify_url: `${siteUrl}/api/pay/notify`,
    return_url: `${siteUrl}/me?pay_order=${encodeURIComponent(orderNo)}`,
    name: `空与梦 AI ${plan.title}`,
    money: formatMoney(plan.amount),
    sitename: "qgyx.asia"
  };
  const sign = createEpaySign(params, config.key);
  const query = new URLSearchParams({
    ...params,
    sign,
    sign_type: "MD5"
  });

  return `${normalizeGateway(config.gateway)}?${query.toString()}`;
}

export function resolveOrderPlan(order: PaymentOrderRow) {
  return normalizePayPlan(order.plan_type || order.plan);
}

export async function addPurchasedCredits(admin: SupabaseClient, userId: string, credits: number) {
  if (credits <= 0) {
    return null;
  }

  const { data: current, error: fetchError } = await admin
    .from("user_credits")
    .select("remaining,total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const nextRemaining = Number(current?.remaining || 0) + credits;
  const nextTotalPurchased = Number(current?.total_purchased || 0) + credits;
  const { data, error } = await admin
    .from("user_credits")
    .upsert(
      {
        user_id: userId,
        remaining: nextRemaining,
        total_purchased: nextTotalPurchased,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("user_id,remaining,total_purchased,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function activateMembership(
  admin: SupabaseClient,
  userId: string,
  level: PaidMembershipLevel,
  days: number
) {
  if (days <= 0) {
    return null;
  }

  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("membership_expire_at")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const currentExpireMs = profile?.membership_expire_at ? new Date(String(profile.membership_expire_at)).getTime() : 0;
  const startMs = Math.max(Date.now(), Number.isFinite(currentExpireMs) ? currentExpireMs : 0);
  const expireAt = new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update({
      membership_level: level,
      membership_expire_at: expireAt
    })
    .eq("id", userId)
    .select("id,membership_level,membership_expire_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function applyPaidOrderBenefits(admin: SupabaseClient, order: PaymentOrderRow) {
  const plan = resolveOrderPlan(order);

  if (!plan) {
    throw new Error("订单套餐无效。");
  }

  if (plan.membershipDays > 0) {
    return {
      plan,
      credits: null,
      membership: await activateMembership(admin, order.user_id, plan.membershipLevel, plan.membershipDays)
    };
  }

  return {
    plan,
    credits: await addPurchasedCredits(admin, order.user_id, Number(order.credits ?? plan.credits)),
    membership: null
  };
}
