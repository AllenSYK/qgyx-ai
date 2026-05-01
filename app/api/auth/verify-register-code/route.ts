import { apiError, apiSuccess } from "@/lib/api-response";
import { normalizeEmail, normalizeEmailCode, verifyEmailCodeHash } from "@/lib/email-code";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const cleanEmail = normalizeEmail(String(body?.email || ""));
    const password = String(body?.password || "");
    const cleanCode = normalizeEmailCode(String(body?.code || ""));

    if (!cleanEmail) {
      return apiError("邮箱不能为空。", 400);
    }

    if (password.length < 6) {
      return apiError("密码至少需要 6 位。", 400);
    }

    if (!/^\d{8}$/.test(cleanCode)) {
      return apiError("请输入 8 位邮箱验证码。", 400);
    }

    const admin = createSupabaseAdminClient();

    const { data: row, error: queryError } = await admin
      .from("email_verification_codes")
      .select("id,email,code_hash,expires_at,consumed_at")
      .eq("email", cleanEmail)
      .eq("purpose", "register")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      throw new Error(queryError.message);
    }

    if (!row) {
      return apiError("验证码不存在，请重新发送。", 400);
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return apiError("验证码已过期，请重新发送。", 400);
    }

    if (!verifyEmailCodeHash(cleanEmail, cleanCode, row.code_hash)) {
      return apiError("验证码不正确，请重新输入。", 400);
    }

    const { data: users, error: listError } = await admin.auth.admin.listUsers();
    if (listError) {
      throw new Error(listError.message);
    }

    const exists = users.users.some((user) => user.email?.toLowerCase() === cleanEmail);
    if (exists) {
      return apiError("这个邮箱已经注册过，请直接登录。", 409);
    }

    const { error: createError } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true
    });

    if (createError) {
      throw new Error(createError.message);
    }

    await admin
      .from("email_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "注册失败，请稍后再试。", 500);
  }
}
