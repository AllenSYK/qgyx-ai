export const runtime = "nodejs";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { getEffectiveMembershipLevel } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function todayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function rate(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Number((part / total).toFixed(4));
}

export async function GET() {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return apiError(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const admin = createSupabaseAdminClient();
    const today = todayStartIso();

    const [
      { count: totalUsersCount, error: totalUsersError },
      { data: profiles, error: profilesError },
      { data: credits, error: creditsError },
      { data: paidOrders, error: paidOrdersError },
      { data: activeProfiles, error: activeProfilesError },
      { data: activeUsageLogs, error: activeUsageError },
      { data: activeUploads, error: activeUploadsError }
    ] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id,membership_level,membership_expire_at"),
      admin.from("user_credits").select("user_id,remaining,total_purchased"),
      admin.from("payment_orders").select("user_id,amount,status").eq("status", "paid"),
      admin.from("profiles").select("id").gte("last_login_at", today),
      admin.from("ai_usage_logs").select("user_id").gte("created_at", today),
      admin.from("uploaded_files").select("user_id").gte("created_at", today)
    ]);

    if (totalUsersError) throw new Error(totalUsersError.message);
    if (profilesError) throw new Error(profilesError.message);
    if (creditsError) throw new Error(creditsError.message);
    if (paidOrdersError) throw new Error(paidOrdersError.message);
    if (activeProfilesError) throw new Error(activeProfilesError.message);
    if (activeUsageError) throw new Error(activeUsageError.message);
    if (activeUploadsError) throw new Error(activeUploadsError.message);

    const totalUsers = totalUsersCount || 0;
    const activeUserIds = new Set<string>();

    (activeProfiles || []).forEach((profile) => {
      if (profile.id) activeUserIds.add(profile.id as string);
    });
    (activeUsageLogs || []).forEach((log) => {
      if (log.user_id) activeUserIds.add(log.user_id as string);
    });
    (activeUploads || []).forEach((upload) => {
      if (upload.user_id) activeUserIds.add(upload.user_id as string);
    });

    const paidUserIds = new Set<string>();
    const creditMap = new Map(
      (credits || []).map((credit) => [
        credit.user_id as string,
        {
          remaining: Number(credit.remaining || 0),
          totalPurchased: Number(credit.total_purchased || 0)
        }
      ])
    );

    (profiles || []).forEach((profile) => {
      const userCredits = creditMap.get(profile.id as string);
      const effectiveLevel = getEffectiveMembershipLevel({
        membershipLevel: profile.membership_level,
        membershipExpireAt: (profile.membership_expire_at as string | null) || null,
        creditsRemaining: userCredits?.remaining || 0
      });

      if (effectiveLevel !== "free" || (userCredits?.totalPurchased || 0) > 0) {
        paidUserIds.add(profile.id as string);
      }
    });
    (credits || []).forEach((credit) => {
      if (Number(credit.total_purchased || 0) > 0) {
        paidUserIds.add(credit.user_id as string);
      }
    });
    (paidOrders || []).forEach((order) => {
      if (order.user_id) {
        paidUserIds.add(order.user_id as string);
      }
    });

    const totalRevenue = (paidOrders || []).reduce((total, order) => total + Number(order.amount || 0), 0);
    const dailyActiveUsers = activeUserIds.size;
    const totalPaidUsers = paidUserIds.size;

    return apiSuccess({
      totalUsers,
      dailyActiveUsers,
      dailyActiveRate: rate(dailyActiveUsers, totalUsers),
      totalPaidUsers,
      totalRevenue,
      conversionRate: rate(totalPaidUsers, totalUsers)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取管理员统计失败。";
    return apiError(message, 500);
  }
}
