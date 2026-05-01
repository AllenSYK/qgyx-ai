"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function exchangeRecoveryCode() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (!cancelled && exchangeError) {
        setError("重置链接已失效，请重新发送密码重置邮件。");
      }
    }

    void exchangeRecoveryCode();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("密码更新失败，请重新打开邮件中的链接。");
        return;
      }

      setNotice("密码已更新，请使用新密码登录。");
      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 500);
    } finally {
      window.setTimeout(() => setSubmitting(false), 200);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-center text-2xl font-semibold text-slate-950">
        qgyx.asia
      </Link>
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-card backdrop-blur transition duration-[250ms] ease-out sm:p-8"
      >
        <div className="mb-8">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">重置密码</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">输入新密码后即可继续登录 qgyx.asia。</p>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">新密码</span>
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

        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-medium text-slate-700">确认新密码</span>
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

        {notice ? (
          <div className="mb-5 flex gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {notice}
          </div>
        ) : null}
        {error ? <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:opacity-75"
        >
          <LockKeyhole className="h-5 w-5" />
          更新密码
        </button>
      </form>
    </main>
  );
}

