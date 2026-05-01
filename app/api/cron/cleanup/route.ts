export const runtime = "nodejs";
export const maxDuration = 120;

import { apiError, apiSuccess } from "@/lib/api-response";
import { MEMBERSHIP_RETENTION_DAYS, normalizeMembershipLevel } from "@/lib/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function cleanupForUsers(userIds: string[], days: number) {
  if (userIds.length === 0) {
    return {
      analysisJobs: 0,
      quizRecords: 0,
      usageLogs: 0
    };
  }

  const admin = createSupabaseAdminClient();
  const cutoff = cutoffIso(days);
  const [jobs, quiz, logs] = await Promise.all([
    admin
      .from("analysis_jobs")
      .delete()
      .lt("created_at", cutoff)
      .eq("is_saved", false)
      .in("user_id", userIds)
      .select("id"),
    admin
      .from("quiz_records")
      .delete()
      .lt("created_at", cutoff)
      .eq("is_saved", false)
      .in("user_id", userIds)
      .select("id"),
    admin
      .from("ai_usage_logs")
      .delete()
      .lt("created_at", cutoff)
      .in("user_id", userIds)
      .select("id")
  ]);

  if (jobs.error) throw new Error(jobs.error.message);
  if (quiz.error) throw new Error(quiz.error.message);
  if (logs.error) throw new Error(logs.error.message);

  return {
    analysisJobs: jobs.data?.length || 0,
    quizRecords: quiz.data?.length || 0,
    usageLogs: logs.data?.length || 0
  };
}

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!secret || authHeader !== `Bearer ${secret}`) {
      return apiError("CRON_SECRET 校验失败。", 401);
    }

    const admin = createSupabaseAdminClient();
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id,membership_level,membership_expire_at")
      .limit(5000);

    if (error) {
      throw new Error(error.message);
    }

    const now = Date.now();
    const freeUsers: string[] = [];
    const memberUsers: string[] = [];

    (profiles || []).forEach((profile) => {
      const level = normalizeMembershipLevel(profile.membership_level);
      const expireAt = profile.membership_expire_at ? new Date(String(profile.membership_expire_at)).getTime() : null;
      const activeMember = level !== "free" && (!expireAt || expireAt > now);

      if (activeMember) {
        memberUsers.push(profile.id as string);
      } else {
        freeUsers.push(profile.id as string);
      }
    });

    const [freeResult, memberResult] = await Promise.all([
      cleanupForUsers(freeUsers, MEMBERSHIP_RETENTION_DAYS.free),
      cleanupForUsers(memberUsers, MEMBERSHIP_RETENTION_DAYS.pro)
    ]);

    return apiSuccess({
      free: freeResult,
      members: memberResult
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自动清理失败。";
    return apiError(message, 500);
  }
}
