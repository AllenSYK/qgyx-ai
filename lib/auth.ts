import "server-only";

import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type Profile = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  created_at: string;
};

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
    .select("id,email,role,created_at")
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
      role: "user"
    })
    .select("id,email,role,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile;
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
