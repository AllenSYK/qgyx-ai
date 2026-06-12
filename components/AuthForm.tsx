"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LoaderCircle, LockKeyhole, LogIn, Mail, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "register";
};

function friendlyAuthError(message: string, mode: AuthFormProps["mode"]) {
  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return mode === "login" ? "邮箱或密码不正确，请确认账号已注册并输入正确密码。" : "账号信息不正确。";
  }

  if (lower.includes("user not found")) {
    return "用户不存在，请先注册账号。";
  }

  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already registered")) {
    return "这个邮箱已经注册过，请直接登录。";
  }

  return message || "操作失败，请稍后再试。";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const isLogin = mode === "login";

  async function syncProfileByAuthUser() {
    const response = await fetch("/api/auth/sync-profile", {
      method: "POST"
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || "账号信息同步失败。");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("请输入邮箱。");
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    let keepLoadingForNavigation = false;

    try {
      if (isLogin) {
        const supabase = createSupabaseBrowserClient();

        const authResult = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (authResult.error) {
          setError(friendlyAuthError(authResult.error.message, mode));
          return;
        }

        await syncProfileByAuthUser();
        keepLoadingForNavigation = true;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const response = await fetch("/api/auth/send-register-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: cleanEmail,
          password
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setError(data?.error || "验证码发送失败，请稍后再试。");
        return;
      }

      sessionStorage.setItem("qgyx_register_email", cleanEmail);
      sessionStorage.setItem("qgyx_register_password", password);

      keepLoadingForNavigation = true;
      router.push(`/verify-email?email=${encodeURIComponent(cleanEmail)}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "操作失败，请稍后再试。");
    } finally {
      if (!keepLoadingForNavigation) {
        setLoading(false);
      }
    }
  }

  async function handleResetPassword() {
    setError("");
    setNotice("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("请先输入邮箱。");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setResettingPassword(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (resetError) {
        setError(friendlyAuthError(resetError.message, mode));
        return;
      }

      setNotice("重置密码邮件已发送，请前往邮箱继续。");
    } finally {
      window.setTimeout(() => setResettingPassword(false), 200);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-card backdrop-blur sm:p-8"
    >
      <div className="mb-8">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {isLogin ? <LogIn className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
        </div>

        <h1 className="text-2xl font-semibold text-slate-950">
          {isLogin ? "登录 qgyx.asia" : "注册 qgyx.asia"}
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isLogin
            ? "继续生成 AI 同类型练习，查看历史记录和学习报告。"
            : "输入邮箱和密码后，我们会通过 Resend 向你的邮箱发送 8 位验证码。"}
        </p>
      </div>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium text-slate-700">邮箱</span>
        <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
          <Mail className="h-5 w-5 text-slate-400" />
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-transparent text-slate-950 outline-none placeholder:text-slate-400"
            placeholder="name@example.com"
          />
        </span>
      </label>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium text-slate-700">密码</span>
        <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
          <LockKeyhole className="h-5 w-5 text-slate-400" />
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-transparent text-slate-950 outline-none placeholder:text-slate-400"
            placeholder="至少 6 位"
          />
        </span>
      </label>

      {isLogin ? (
        <button
          type="button"
          onClick={() => void handleResetPassword()}
          disabled={resettingPassword}
          className="mb-5 inline-flex text-sm font-medium text-blue-700 transition duration-200 ease-out hover:text-blue-800 active:scale-[0.97] active:opacity-75 disabled:opacity-75"
        >
          忘记密码？
        </button>
      ) : null}

      {!isLogin ? (
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">确认密码</span>
          <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
            <LockKeyhole className="h-5 w-5 text-slate-400" />
            <input
              required
              minLength={6}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full bg-transparent text-slate-950 outline-none placeholder:text-slate-400"
              placeholder="再次输入密码"
            />
          </span>
        </label>
      ) : null}

      {notice ? (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:opacity-75"
      >
        {loading ? (
          <LoaderCircle className="h-5 w-5 animate-spin" />
        ) : isLogin ? (
          <LogIn className="h-5 w-5" />
        ) : (
          <UserPlus className="h-5 w-5" />
        )}
        {isLogin ? (loading ? "正在登录..." : "登录") : loading ? "正在发送验证码..." : "发送邮箱验证码"}
      </button>

      <p className="mt-6 text-center text-sm text-slate-600">
        {isLogin ? "还没有账号？" : "已经有账号？"}
        <Link className="ml-1 font-medium text-blue-700 hover:text-blue-800" href={isLogin ? "/register" : "/login"}>
          {isLogin ? "立即注册" : "去登录"}
        </Link>
      </p>
    </form>
  );
}
