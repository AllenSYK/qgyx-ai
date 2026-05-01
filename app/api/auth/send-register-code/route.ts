import { apiError, apiSuccess } from "@/lib/api-response";
import { generateEmailCode, hashEmailCode, normalizeEmail } from "@/lib/email-code";
import { renderRegisterCodeEmail } from "@/lib/email-template";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const cleanEmail = normalizeEmail(String(body?.email || ""));
    const password = String(body?.password || "");

    if (!cleanEmail) {
      return apiError("请输入邮箱。", 400);
    }

    if (password.length < 6) {
      return apiError("密码至少需要 6 位。", 400);
    }

    if (!process.env.RESEND_API_KEY) {
      return apiError("RESEND_API_KEY 未配置。", 500);
    }

    if (!process.env.EMAIL_FROM) {
      return apiError("EMAIL_FROM 未配置。", 500);
    }

    const admin = createSupabaseAdminClient();

    const { data: users, error: listError } = await admin.auth.admin.listUsers();

    if (listError) {
      throw new Error(listError.message);
    }

    const exists = users.users.some((user) => user.email?.toLowerCase() === cleanEmail);

    if (exists) {
      return apiError("这个邮箱已经注册过，请直接登录。", 409);
    }

    await admin
      .from("email_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", cleanEmail)
      .eq("purpose", "register")
      .is("consumed_at", null);

    const code = generateEmailCode();

    const { error: insertError } = await admin.from("email_verification_codes").insert({
      email: cleanEmail,
      code_hash: hashEmailCode(cleanEmail, code),
      purpose: "register",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const sendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: cleanEmail,
        subject: "你的空与梦 AI 注册验证码",
        html: renderRegisterCodeEmail(code)
      })
    });

    if (!sendResponse.ok) {
      const resendError = await sendResponse.json().catch(() => null);
      throw new Error(
        typeof resendError?.message === "string"
          ? resendError.message
          : "邮件发送失败。"
      );
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "验证码发送失败。", 500);
  }
}
