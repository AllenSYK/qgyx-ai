import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type Profile = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  membership_level?: "free" | "pro" | "max" | "premium" | null;
  membership_expire_at?: string | null;
  is_banned?: boolean | null;
  ban_reason?: string | null;
  banned_at?: string | null;
  created_at: string;
};

export const BANNED_ACCOUNT_MESSAGE = "账户状态异常，请联系客服处理。微信：15155132939";

export type UserCredits = {
  user_id: string;
  remaining: number;
  total_purchased: number;
  updated_at: string;
};

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function getProfile(
  userId: string,
  client?: SupabaseServerClient
): Promise<Profile | null> {
  const supabase = client || (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,membership_level,membership_expire_at,is_banned,ban_reason,banned_at,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}

export async function ensureUserCredits(
  user: User,
  client?: SupabaseServerClient
): Promise<UserCredits> {
  const supabase = client || (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("user_credits")
    .select("user_id,remaining,total_purchased,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as UserCredits;
  }

  const { data: created, error: createError } = await supabase
    .from("user_credits")
    .insert({
      user_id: user.id,
      remaining: 5,
      total_purchased: 0
    })
    .select("user_id,remaining,total_purchased,updated_at")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created as UserCredits;
}

export async function ensureProfile(user: User, client?: SupabaseServerClient): Promise<Profile> {
  const supabase = client || (await createSupabaseServerClient());
  const existing = await getProfile(user.id, supabase);

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? null,
      role: "user",
      membership_level: "free"
    })
    .select("id,email,role,membership_level,membership_expire_at,is_banned,ban_reason,banned_at,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile;
}

export async function getAccountBanStatus(
  userId: string,
  client?: SupabaseServerClient
): Promise<{ isBanned: boolean; reason: string | null; bannedAt: string | null }> {
  const supabase = client || (await createSupabaseServerClient());
  const { data, error } = await supabase
    .from("profiles")
    .select("is_banned,ban_reason,banned_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    isBanned: Boolean(data?.is_banned),
    reason: (data?.ban_reason as string | null | undefined) || null,
    bannedAt: (data?.banned_at as string | null | undefined) || null
  };
}

export async function assertUserNotBanned(userId: string, client?: SupabaseServerClient) {
  const status = await getAccountBanStatus(userId, client);
  return status.isBanned ? BANNED_ACCOUNT_MESSAGE : null;
}

export async function requireAdminUser() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      isAdmin: false,
      error: "请先登录。"
    };
  }

  const profile = await ensureProfile(user, supabase);

  return {
    user,
    profile,
    isAdmin: profile.role === "admin",
    error: profile.role === "admin" ? null : "无权访问管理员后台。"
  };
}
