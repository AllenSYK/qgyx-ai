import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Coins, FileQuestion, LogOut, Mail, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ensureProfile, ensureUserCredits, getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function DashboardPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [credits, profile] = await Promise.all([ensureUserCredits(user, supabase), ensureProfile(user, supabase)]);
  const { count } = await supabase
    .from("quiz_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const usedCredits = Math.max(0, 5 + credits.total_purchased - credits.remaining);
  const stats: Array<{
    label: string;
    value: number;
    Icon: LucideIcon;
    tone: string;
  }> = [
    {
      label: "剩余次数",
      value: credits.remaining,
      Icon: Coins,
      tone: "text-blue-700 bg-blue-50"
    },
    {
      label: "已使用次数",
      value: usedCredits,
      Icon: FileQuestion,
      tone: "text-emerald-700 bg-emerald-50"
    },
    {
      label: "已购买次数",
      value: credits.total_purchased,
      Icon: WalletCards,
      tone: "text-amber-700 bg-amber-50"
    },
    {
      label: "Quiz 记录",
      value: count || 0,
      Icon: FileQuestion,
      tone: "text-slate-700 bg-slate-50"
    }
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Sparkles className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-semibold text-slate-950">qgyx.asia</span>
            <span className="block text-sm text-slate-500">用户中心</span>
          </span>
        </Link>
        <form action={signOut}>
          <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <LogOut className="h-4 w-4" />
            退出
          </button>
        </form>
      </header>

      <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-card sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Mail className="h-4 w-4" />
              {user.email}
            </div>
            <h1 className="text-3xl font-semibold text-slate-950">用户中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              查看剩余次数、已使用记录和账户角色。次数不足时请联系管理员充值。
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            进入 AI Quiz
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>

        {credits.remaining <= 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            次数不足，请联系管理员充值。
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ label, value, Icon, tone }) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-slate-500">{label}</div>
              <div className="mt-1 text-3xl font-semibold text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        {profile.role === "admin" ? (
          <div className="mt-6">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              <ShieldCheck className="h-5 w-5" />
              打开管理员后台
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
