export type MembershipPlanType = "pro_day" | "pro_month" | "max_month";
export type PaidMembershipLevel = "pro" | "max";

export type MembershipPlan = {
  type: MembershipPlanType;
  title: string;
  priceCny: number;
  amount: number;
  priceLabel: string;
  description: string;
  badge: string;
  credits: 0;
  durationDays: number;
  membershipDays: number;
  membershipLevel: PaidMembershipLevel;
};

export const MEMBERSHIP_PLANS: Record<MembershipPlanType, MembershipPlan> = {
  pro_day: {
    type: "pro_day",
    title: "Pro 1天",
    priceCny: 3,
    amount: 3,
    priceLabel: "3 元",
    description: "适合当天集中练习，享受 Pro 会员额度。",
    badge: "Pro 1天",
    credits: 0,
    durationDays: 1,
    membershipDays: 1,
    membershipLevel: "pro"
  },
  pro_month: {
    type: "pro_month",
    title: "Pro 1个月",
    priceCny: 9.9,
    amount: 9.9,
    priceLabel: "9.9 元",
    description: "适合稳定复习，开通 30 天 Pro 会员。",
    badge: "Pro 月",
    credits: 0,
    durationDays: 30,
    membershipDays: 30,
    membershipLevel: "pro"
  },
  max_month: {
    type: "max_month",
    title: "Max 1个月",
    priceCny: 19.9,
    amount: 19.9,
    priceLabel: "19.9 元",
    description: "更高每日额度与优先体验，适合高频学习。",
    badge: "Max 月",
    credits: 0,
    durationDays: 30,
    membershipDays: 30,
    membershipLevel: "max"
  }
};

export const MEMBERSHIP_PLAN_LIST = Object.values(MEMBERSHIP_PLANS);

export function normalizeMembershipPlan(value: unknown): MembershipPlan | null {
  return value === "pro_day" || value === "pro_month" || value === "max_month"
    ? MEMBERSHIP_PLANS[value]
    : null;
}

export function membershipPlanBenefitText(planType: MembershipPlanType) {
  const plan = MEMBERSHIP_PLANS[planType];
  return `${plan.membershipLevel === "max" ? "Max" : "Pro"} 会员 ${plan.durationDays === 1 ? "1 天" : "1 个月"}`;
}
