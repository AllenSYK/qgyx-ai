import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MembershipLevel = "free" | "pro" | "max";
export type SpeedMode = "fast" | "slow";

export const MEMBERSHIP_LIMITS: Record<MembershipLevel, number> = {
  free: 3,
  pro: 50,
  max: 100
};

export const MEMBERSHIP_MONTHLY_LIMITS: Record<MembershipLevel, number> = {
  free: 90,
  pro: 1500,
  max: 3000
};

export const MEMBERSHIP_RETENTION_DAYS: Record<MembershipLevel, number> = {
  free: 14,
  pro: 90,
  max: 90
};

type EffectiveMembershipInput =
  | string
  | null
  | undefined
  | {
      membershipLevel?: string | null;
      membershipExpireAt?: string | null;
      creditsRemaining?: number | null;
    };

export function normalizeMembershipLevel(value: unknown): MembershipLevel {
  if (value === "pro") return "pro";
  if (value === "max" || value === "premium") return "max";
  return "free";
}

export function membershipHasActiveBenefits(level: MembershipLevel, expireAt?: string | null) {
  if (level === "free") return false;
  if (!expireAt) return true;

  const expireTime = new Date(expireAt).getTime();
  if (Number.isNaN(expireTime)) return false;

  return expireTime > Date.now();
}

export function getEffectiveMembershipLevel(
  input?: EffectiveMembershipInput,
  membershipExpireAt?: string | null
): MembershipLevel {
  if (typeof input === "object" && input !== null) {
    const level = normalizeMembershipLevel(input.membershipLevel);
    return membershipHasActiveBenefits(level, input.membershipExpireAt) ? level : "free";
  }

  const level = normalizeMembershipLevel(input);
  return membershipHasActiveBenefits(level, membershipExpireAt) ? level : "free";
}

export function dayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export function monthStartIso() {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function getMembershipProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email,role,membership_level,membership_expire_at,is_banned,ban_reason,banned_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const rawMembershipLevel = normalizeMembershipLevel(data?.membership_level);
  const membershipExpireAt = (data?.membership_expire_at as string | null | undefined) || null;

  const membershipLevel = getEffectiveMembershipLevel({
    membershipLevel: rawMembershipLevel,
    membershipExpireAt
  });

  const speedMode: SpeedMode = membershipLevel === "free" ? "slow" : "fast";

  return {
    id: userId,
    email: (data?.email as string | null | undefined) || null,
    role: data?.role === "admin" ? "admin" : "user",
    isBanned: Boolean(data?.is_banned),
    banReason: (data?.ban_reason as string | null | undefined) || null,
    bannedAt: (data?.banned_at as string | null | undefined) || null,

    membershipLevel,
    rawMembershipLevel,
    membershipExpireAt,

    dailyLimit: MEMBERSHIP_LIMITS[membershipLevel],
    monthlyLimit: MEMBERSHIP_MONTHLY_LIMITS[membershipLevel],
    retentionDays: MEMBERSHIP_RETENTION_DAYS[membershipLevel],

    hasActiveMembershipBenefits: membershipLevel !== "free",
    speedMode
  };
}

export async function getDailyGenerationUsage(admin: SupabaseClient, userId: string) {
  const { count, error } = await admin
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "original_explanation")
    .eq("status", "success")
    .gte("created_at", dayStartIso());

  if (error) throw new Error(error.message);

  return count || 0;
}

export async function getMonthlyGenerationUsage(admin: SupabaseClient, userId: string) {
  const { count, error } = await admin
    .from("ai_usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "original_explanation")
    .eq("status", "success")
    .gte("created_at", monthStartIso());

  if (error) throw new Error(error.message);

  return count || 0;
}

export async function getCreditBalance(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("user_credits")
    .select("remaining,total_purchased")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    remaining: Number(data?.remaining || 0),
    totalPurchased: Number(data?.total_purchased || 0)
  };
}

export async function getGenerationAllowance(admin: SupabaseClient, userId: string) {
  const [membership, dailyUsed, monthlyUsed, credits] = await Promise.all([
    getMembershipProfile(admin, userId),
    getDailyGenerationUsage(admin, userId),
    getMonthlyGenerationUsage(admin, userId),
    getCreditBalance(admin, userId)
  ]);

  const dailyRemaining = Math.max(0, membership.dailyLimit - dailyUsed);
  const monthlyRemaining = Math.max(0, membership.monthlyLimit - monthlyUsed);
  const creditsRemaining = credits.remaining;

  const allowed =
    !membership.isBanned &&
    dailyRemaining > 0 &&
    monthlyRemaining > 0;

  return {
    ...membership,

    dailyUsed,
    dailyRemaining,
    dailyLimit: membership.dailyLimit,

    monthlyUsed,
    monthlyRemaining,
    monthlyLimit: membership.monthlyLimit,

    remaining: dailyRemaining,

    creditsRemaining,
    remainingCredits: creditsRemaining,
    totalPurchased: credits.totalPurchased,

    allowed
  };
}

export function createGenerationAllowancePayload(
  allowance: Awaited<ReturnType<typeof getGenerationAllowance>>
) {
  return {
    membershipLevel: allowance.membershipLevel,
    dailyLimit: allowance.dailyLimit,
    dailyUsed: allowance.dailyUsed,
    dailyRemaining: allowance.dailyRemaining,
    daily_limit: allowance.dailyLimit,
    daily_used: allowance.dailyUsed,
    daily_remaining: allowance.dailyRemaining,
    monthlyLimit: allowance.monthlyLimit,
    monthlyUsed: allowance.monthlyUsed,
    monthlyRemaining: allowance.monthlyRemaining,
    monthly_limit: allowance.monthlyLimit,
    monthly_used: allowance.monthlyUsed,
    monthly_remaining: allowance.monthlyRemaining,
    remaining: allowance.remaining,
    creditsRemaining: allowance.creditsRemaining,
    remainingCredits: allowance.creditsRemaining,
    totalPurchased: allowance.totalPurchased,
    allowed: allowance.allowed,
    isBanned: allowance.isBanned,
    speedMode: allowance.speedMode,
    speed_mode: allowance.speedMode,
    hasActiveMembershipBenefits: allowance.hasActiveMembershipBenefits,
    membership: allowance
  };
}

export async function deductGenerationCredit(admin: SupabaseClient, userId: string) {
  const membership = await getMembershipProfile(admin, userId);

  if (membership.hasActiveMembershipBenefits) {
    const credits = await getCreditBalance(admin, userId);
    return credits.remaining;
  }

  const credits = await getCreditBalance(admin, userId);
  const nextRemaining = Math.max(0, credits.remaining - 1);

  const { data, error } = await admin
    .from("user_credits")
    .upsert(
      {
        user_id: userId,
        remaining: nextRemaining,
        total_purchased: credits.totalPurchased,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("remaining")
    .single();

  if (error) throw new Error(error.message);

  return Number(data.remaining || nextRemaining);
}

export async function applySoftLimitDelay(speedMode?: SpeedMode | string) {
  if (speedMode !== "slow") return;

  await new Promise((resolve) => {
    setTimeout(resolve, 1200);
  });
}
