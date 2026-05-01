import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAdminUser } from "@/lib/auth";
import { getEffectiveMembershipLevel, MEMBERSHIP_LIMITS, MEMBERSHIP_MONTHLY_LIMITS } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminUserRow } from "@/types/quiz";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

function todayStartIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function monthStartIso() {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export async function GET() {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return errorResponse(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const admin = createSupabaseAdminClient();
    const today = todayStartIso();
    const month = monthStartIso();
    const [
      { data: profiles, error: profileError },
      { data: credits, error: creditError },
      { data: quizRecords, error: quizError },
      { data: analysisRecords, error: analysisError },
      { data: wrongQuestions, error: wrongError },
      { data: usageLogs, error: usageError },
      { data: analysisJobs, error: jobError },
      { data: paymentOrders, error: orderError },
      authResult
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id,email,role,membership_level,membership_expire_at,is_banned,ban_reason,banned_at,created_at,last_login_at,last_login_ip,ip_country,ip_region,ip_city")
        .order("created_at", { ascending: false })
        .limit(500),
      admin.from("user_credits").select("user_id,remaining,total_purchased"),
      admin
        .from("quiz_records")
        .select("id,user_id,quiz_title,mode,score,questions,wrong_questions,created_at,ip_address,ip_country,ip_region,ip_city")
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("analysis_records")
        .select("id,user_id,recognized_text,mode,knowledge_points,created_at,ip_address,ip_country,ip_region,ip_city")
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("wrong_questions")
        .select("id,user_id,question,knowledge_point,error_type,created_at")
        .order("created_at", { ascending: false })
        .limit(120),
      admin
        .from("ai_usage_logs")
        .select("id,user_id,mode,action,prompt_tokens,completion_tokens,total_tokens,tokens_used,model,status,error_message,ip_address,ip_country,ip_region,ip_city,created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
      admin
        .from("analysis_jobs")
        .select("id,user_id,status,progress,stage,error_message,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(120),
      admin
        .from("payment_orders")
        .select("id,user_id,order_no,plan,plan_type,amount,credits,status,provider,pay_type,payment_method,trade_no,uploaded_screenshot_url,extracted_amount,extracted_trade_no,extracted_paid_at,ai_risk_score,ai_review_result,risk_level,is_suspicious,reviewed,review_result,reject_reason,paid_at,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.auth.admin.listUsers({ page: 1, perPage: 500 }).catch((authError) => ({ data: { users: [] }, error: authError }))
    ]);

    if (profileError) throw new Error(profileError.message);
    if (creditError) throw new Error(creditError.message);
    if (quizError) throw new Error(quizError.message);
    if (analysisError) throw new Error(analysisError.message);
    if (wrongError) throw new Error(wrongError.message);
    if (usageError) throw new Error(usageError.message);
    if (jobError) throw new Error(jobError.message);
    if (orderError) throw new Error(orderError.message);

    const creditMap = new Map(
      (credits || []).map((credit) => [
        credit.user_id as string,
        {
          remaining: Number(credit.remaining || 0),
          total_purchased: Number(credit.total_purchased || 0)
        }
      ])
    );
    const quizCountMap = new Map<string, number>();
    const analysisCountMap = new Map<string, number>();
    const tokenMap = new Map<string, number>();
    const dailyUsageMap = new Map<string, number>();
    const monthlyUsageMap = new Map<string, number>();
    const lastUsedMap = new Map<string, string>();

    (quizRecords || []).forEach((record) => {
      const userId = record.user_id as string;
      quizCountMap.set(userId, (quizCountMap.get(userId) || 0) + 1);
      lastUsedMap.set(userId, String(record.created_at));
    });

    (analysisRecords || []).forEach((record) => {
      const userId = record.user_id as string;
      analysisCountMap.set(userId, (analysisCountMap.get(userId) || 0) + 1);
      const previous = lastUsedMap.get(userId);
      if (!previous || new Date(String(record.created_at)) > new Date(previous)) {
        lastUsedMap.set(userId, String(record.created_at));
      }
    });

    (usageLogs || []).forEach((log) => {
      const userId = log.user_id as string;
      tokenMap.set(userId, (tokenMap.get(userId) || 0) + Number(log.total_tokens || 0));
      if (String(log.created_at) >= today && log.action === "original_explanation" && log.status === "success") {
        dailyUsageMap.set(userId, (dailyUsageMap.get(userId) || 0) + 1);
      }
      if (String(log.created_at) >= month && log.action === "original_explanation" && log.status === "success") {
        monthlyUsageMap.set(userId, (monthlyUsageMap.get(userId) || 0) + 1);
      }
    });

    const authUserMap = new Map(
      (authResult.data?.users || []).map((authUser) => [
        authUser.id,
        {
          last_sign_in_at: authUser.last_sign_in_at || null,
          email_confirmed_at: authUser.email_confirmed_at || null
        }
      ])
    );

    const users: AdminUserRow[] = (profiles || []).map((profile) => {
      const userCredits = creditMap.get(profile.id as string);
      const quiz_count = quizCountMap.get(profile.id as string) || 0;
      const analysis_count = analysisCountMap.get(profile.id as string) || 0;
      const authUser = authUserMap.get(profile.id as string);
      const membershipExpireAt = (profile.membership_expire_at as string | null) || null;
      const membershipLevel = getEffectiveMembershipLevel({
        membershipLevel: profile.membership_level,
        membershipExpireAt,
        creditsRemaining: userCredits?.remaining ?? 0
      });
      const dailyUsed = dailyUsageMap.get(profile.id as string) || 0;
      const monthlyUsed = monthlyUsageMap.get(profile.id as string) || 0;
      const dailyLimit = MEMBERSHIP_LIMITS[membershipLevel];
      const monthlyLimit = MEMBERSHIP_MONTHLY_LIMITS[membershipLevel];

      return {
        id: profile.id as string,
        email: (profile.email as string | null) || null,
        role: profile.role === "admin" ? "admin" : "user",
        created_at: profile.created_at as string,
        last_login_at: (authUser?.last_sign_in_at || profile.last_login_at || null) as string | null,
        last_login_ip: (profile.last_login_ip as string | null) || null,
        ip_country: (profile.ip_country as string | null) || null,
        ip_region: (profile.ip_region as string | null) || null,
        ip_city: (profile.ip_city as string | null) || null,
        remaining: userCredits?.remaining ?? 0,
        total_purchased: userCredits?.total_purchased ?? 0,
        membership_level: membershipLevel,
        membership_expire_at: membershipExpireAt,
        daily_used: dailyUsed,
        daily_limit: dailyLimit,
        monthly_used: monthlyUsed,
        monthly_limit: monthlyLimit,
        speed_mode: membershipLevel === "pro" && dailyUsed >= dailyLimit ? "slow" : "fast",
        is_banned: Boolean(profile.is_banned),
        ban_reason: (profile.ban_reason as string | null) || null,
        banned_at: (profile.banned_at as string | null) || null,
        used_count: quiz_count + analysis_count,
        quiz_count,
        analysis_count,
        total_calls: (usageLogs || []).filter((log) => log.user_id === profile.id).length,
        total_tokens: tokenMap.get(profile.id as string) || 0,
        last_used_at: lastUsedMap.get(profile.id as string) || null
      };
    });

    const stats = {
      totalUsers: users.length,
      todayNewUsers: users.filter((user) => user.created_at >= today).length,
      todayGenerations: [...(quizRecords || []), ...(analysisRecords || [])].filter((record) => String(record.created_at) >= today).length,
      totalQuiz: quizRecords?.length || 0,
      totalAnalysis: analysisRecords?.length || 0,
      totalWrong: wrongQuestions?.length || 0,
      totalJobs: analysisJobs?.length || 0,
      failedJobs: (analysisJobs || []).filter((job) => job.status === "failed").length,
      totalOrders: paymentOrders?.length || 0,
      totalTokens: (usageLogs || []).reduce((total, log) => total + Number(log.total_tokens || 0), 0)
    };

    return apiSuccess({
      users,
      stats,
      quizRecords: quizRecords || [],
      analysisRecords: analysisRecords || [],
      wrongQuestions: wrongQuestions || [],
      usageLogs: usageLogs || [],
      analysisJobs: analysisJobs || [],
      paymentOrders: paymentOrders || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取用户列表失败。";
    return errorResponse(message, 500);
  }
}
