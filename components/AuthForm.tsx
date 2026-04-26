"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Loader2, LockKeyhole, LogIn, Mail, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode: "login" | "register";
};

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const authResult = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (authResult.error) {
      setError(authResult.error.message || "认证失败，请检查邮箱和密码。");
      return;
    }

    router.push("/dashboard");
    router.refresh();
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
          {isLogin ? "继续生成 AI 交互 Quiz。" : "新用户默认获得 5 次免费使用次数。"}
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

      <label className="mb-5 block">
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

      {error ? (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
        {isLogin ? "登录" : "注册"}
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
