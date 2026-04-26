import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminQuizSessionRow, AdminUserRow, Quiz } from "@/types/quiz";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const { isAdmin, error } = await requireAdminUser();

    if (!isAdmin) {
      return errorResponse(error || "无权访问管理员接口。", error === "请先登录。" ? 401 : 403);
    }

    const admin = createSupabaseAdminClient();
    const [{ data: profiles, error: profileError }, { data: credits, error: creditError }] =
      await Promise.all([
        admin.from("profiles").select("id,email,role,created_at").order("created_at", {
          ascending: false
        }),
        admin.from("user_credits").select("user_id,remaining,total_purchased")
      ]);

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (creditError) {
      throw new Error(creditError.message);
    }

    const creditMap = new Map(
      (credits || []).map((credit) => [
        credit.user_id as string,
        {
          remaining: Number(credit.remaining || 0),
          total_purchased: Number(credit.total_purchased || 0)
        }
      ])
    );

    const users: AdminUserRow[] = (profiles || []).map((profile) => {
      const userCredits = creditMap.get(profile.id as string);

      return {
        id: profile.id as string,
        email: (profile.email as string | null) || null,
        role: profile.role === "admin" ? "admin" : "user",
        created_at: profile.created_at as string,
        remaining: userCredits?.remaining ?? 0,
        total_purchased: userCredits?.total_purchased ?? 0
      };
    });

    const { data: sessions, error: sessionError } = await admin
      .from("quiz_sessions")
      .select("id,user_id,quiz,created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    const emailMap = new Map(users.map((user) => [user.id, user.email]));
    const recentSessions: AdminQuizSessionRow[] = (sessions || []).map((session) => {
      const quiz = session.quiz as Quiz | null;

      return {
        id: session.id as string,
        user_id: (session.user_id as string | null) || null,
        user_email: session.user_id ? emailMap.get(session.user_id as string) || null : null,
        title: quiz?.title || "未命名 Quiz",
        created_at: session.created_at as string
      };
    });

    return NextResponse.json({ users, recentSessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取用户列表失败。";
    return errorResponse(message, 500);
  }
}
