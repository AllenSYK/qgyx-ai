"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Loader2, LockKeyhole, LogIn, Mail, RotateCcw, ShieldCheck, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "register";
};

function friendlyAuthError(message: string, mode: AuthFormProps["mode"]) {
  const lower = message.toLowerCase();

  if (lower.includes("email not confirmed") || lower.includes("not confirmed")) {
    return "邮箱还没有完成验证，请先打开邮箱完成验证。";
  }

  if (lower.includes("invalid login credentials")) {
    return mode === "login" ? "邮箱或密码不正确，请确认账号已注册并输入正确密码。" : "验证码或账号信息不正确。";
  }

  if (lower.includes("user not found")) {
    return "用户不存在，请先注册账号。";
  }

  if (lower.includes("otp") || lower.includes("token")) {
    return "验证码不正确或已过期，请检查后重试。";
  }

  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "这个邮箱已经注册过，请直接登录。";
  }

  return message || "操作失败，请稍后再试。";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const isLogin = mode === "login";

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const supabase = createSupabaseBrowserClient();

    if (isLogin) {
      setLoading(true);
      const authResult = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);

      if (authResult.error) {
        setError(friendlyAuthError(authResult.error.message, mode));
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);

    const authResult = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
    });

    setLoading(false);

    if (authResult.error) {
      setError(friendlyAuthError(authResult.error.message, mode));
      return;
    }

    setStep("otp");
    setCountdown(60);
    setNotice("验证码已发送到你的邮箱，请输入验证码完成注册。");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (otp.length !== 6) {
      setError("请输入 6 位邮箱验证码。");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setLoading(true);

    const result = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email"
    });

    setLoading(false);

    if (result.error) {
      setError(friendlyAuthError(result.error.message, mode));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function resendCode() {
    if (countdown > 0) return;

    setError("");
    setNotice("");

    const supabase = createSupabaseBrowserClient();
    setLoading(true);

    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true
      }
    });

    setLoading(false);

    if (result.error) {
      setError(friendlyAuthError(result.error.message, mode));
      return;
    }

    setCountdown(60);
    setNotice("新的验证码已发送，请查看邮箱。");
  }

  if (!isLogin && step === "otp") {
    return (
      <form
        onSubmit={verifyCode}
        className="w-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-card sm:p-8"
      >
        <div className="mb-8">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">验证邮箱</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            验证码已发送到 <span className="font-semibold text-slate-950">{email}</span>，请输入 6 位验证码完成注册。
          </p>
        </div>

        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">邮箱验证码</span>
          <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
            <KeyRound className="h-5 w-5 text-slate-400" />
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full bg-transparent text-center text-xl font-semibold tracking-[0.55em] text-slate-950 outline-none placeholder:text-slate-300"
              placeholder="000000"
            />
          </span>
        </label>

        {notice ? <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{notice}</div> : null}
        {error ? <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          完成注册并登录
        </button>

        <button
          type="button"
          onClick={resendCode}
          disabled={loading || countdown > 0}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <RotateCcw className="h-4 w-4" />
          {countdown > 0 ? `${countdown}s 后可重发` : "重新发送验证码"}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-card sm:p-8"
    >
      <div className="mb-8">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {isLogin ? <LogIn className="h-6 w-6" /> : <UserPlus className="h-6 w-6" />}
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">
          {isLogin ? "登录 qgyx.asia" : "注册 qgyx.asia"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isLogin ? "继续生成 AI 同类型练习。" : "注册后需要输入邮箱验证码，新用户默认获得 5 次免费使用次数。"}
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

      {error ? <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
        {isLogin ? "登录" : "发送验证码"}
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
