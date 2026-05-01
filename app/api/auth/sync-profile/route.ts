import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth";
import { getRequestMeta } from "@/lib/request-meta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return apiError(message, status);
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser();

    if (!user) {
      return errorResponse("请先登录。", 401);
    }

    const meta = getRequestMeta(request);
    const admin = createSupabaseAdminClient();

    const { data: existing, error: existingError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const payload = {
      email: user.email ?? null,
      last_login_at: new Date().toISOString(),
      last_login_ip: meta.ipAddress,
      ip_address: meta.ipAddress,
      ip_country: meta.ipCountry,
      ip_region: meta.ipRegion,
      ip_city: meta.ipCity
    };

    const { error } = existing
      ? await admin.from("profiles").update(payload).eq("id", user.id)
      : await admin.from("profiles").insert({
        id: user.id,
        role: "user",
        ...payload
      });

    if (error) {
      throw new Error(error.message);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步用户信息失败。";
    return errorResponse(message, 500);
  }
}
