"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
import { InlineQuizMathText } from "@/components/QuizMathText";
import type { AdminUserRow } from "@/types/quiz";

type AdminMembershipLevel = "free" | "pro" | "max";

type AdminRecord = {
  id: string;
  user_id: string | null;
  quiz_title?: string | null;
  question?: string | null;
  recognized_text?: string | null;
  knowledge_point?: string | null;
  error_type?: string | null;
  mode?: string | null;
  status?: string | null;
  progress?: number | null;
  stage?: string | null;
  order_no?: string | null;
  plan?: string | null;
  plan_type?: string | null;
  amount?: number | null;
  credits?: number | null;
  provider?: string | null;
  pay_type?: string | null;
  payment_method?: string | null;
  trade_no?: string | null;
  uploaded_screenshot_url?: string | null;
  extracted_amount?: number | null;
  extracted_trade_no?: string | null;
  extracted_paid_at?: string | null;
  ai_risk_score?: number | null;
  ai_review_result?: string | null;
  risk_level?: number | null;
  is_suspicious?: boolean | null;
  reviewed?: boolean | null;
  review_result?: string | null;
  reject_reason?: string | null;
  paid_at?: string | null;
  updated_at?: string | null;
  created_at: string;
  total_tokens?: number | null;
  error_message?: string | null;
  ip_address?: string | null;
  ip_country?: string | null;
  ip_region?: string | null;
  ip_city?: string | null;
};

type AdminPayload = {
  users: AdminUserRow[];
  stats: {
    totalUsers: number;
    todayNewUsers: number;
    todayGenerations: number;
    totalQuiz: number;
    totalAnalysis: number;
    totalWrong: number;
    totalJobs?: number;
    failedJobs?: number;
    totalOrders?: number;
    totalTokens: number;
  };
  quizRecords: AdminRecord[];
  analysisRecords: AdminRecord[];
  wrongQuestions: AdminRecord[];
  usageLogs: AdminRecord[];
  analysisJobs?: AdminRecord[];
  paymentOrders?: AdminRecord[];
};

type AdminStats = {
  totalUsers: number;
  dailyActiveUsers: number;
  dailyActiveRate: number;
  totalPaidUsers: number;
  totalRevenue: number;
  conversionRate: number;
};

const emptyAdminStats: AdminStats = {
  totalUsers: 0,
  dailyActiveUsers: 0,
  dailyActiveRate: 0,
  totalPaidUsers: 0,
  totalRevenue: 0,
  conversionRate: 0
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function regionText(row: { ip_address?: string | null; ip_country?: string | null; ip_region?: string | null; ip_city?: string | null }) {
  return [row.ip_address, row.ip_country, row.ip_region, row.ip_city].filter(Boolean).join(" / ") || "-";
}

function percentText(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function moneyText(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function CircleProgress({ value }: { value: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, value));

  return (
    <svg viewBox="0 0 72 72" className="h-20 w-20">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-100" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        className="origin-center -rotate-90 text-blue-600 transition-all duration-500 ease-out"
      />
      <text x="36" y="39" textAnchor="middle" className="fill-slate-950 text-[13px] font-semibold">
        {percentText(progress)}
      </text>
    </svg>
  );
}

function daysLeft(expireAt?: string | null) {
  if (!expireAt) return "-";
  const diff = new Date(expireAt).getTime() - Date.now();
  if (!Number.isFinite(diff)) return "-";
  return `${Math.max(0, Math.ceil(diff / 86400000))} 天`;
}

function compactStatus(user: AdminUserRow) {
  if (user.is_banned) return "异常";
  if (user.speed_mode === "slow") return "排队";
  return "正常";
}

function AdminStatsDashboard({ stats, ready }: { stats: AdminStats; ready: boolean }) {
  const items = [
    {
      label: "总用户数",
      value: String(stats.totalUsers),
      progress: stats.totalUsers > 0 ? 1 : 0
    },
    {
      label: "日活人数",
      value: String(stats.dailyActiveUsers),
      progress: stats.dailyActiveRate
    },
    {
      label: "日活率",
      value: percentText(stats.dailyActiveRate),
      progress: stats.dailyActiveRate
    },
    {
      label: "付费人数",
      value: String(stats.totalPaidUsers),
      progress: stats.conversionRate
    },
    {
      label: "转化率",
      value: percentText(stats.conversionRate),
      progress: stats.conversionRate
    },
    {
      label: "总收入",
      value: moneyText(stats.totalRevenue),
      progress: stats.conversionRate
    }
  ];

  return (
    <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <ShieldCheck className="h-4 w-4" />
          数据面板
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">Admin Dashboard</h1>
      </div>
      <div className={ready ? "grid gap-3 opacity-100 transition duration-[250ms] ease-out sm:grid-cols-2 lg:grid-cols-6" : "grid translate-y-2 gap-3 opacity-0 transition duration-[250ms] ease-out sm:grid-cols-2 lg:grid-cols-6"}>
        {items.map((item) => (
          <article
            key={item.label}
            className="rounded-[26px] border border-blue-100/80 bg-white/80 p-4 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-glass"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-950">{item.value}</div>
              </div>
              <CircleProgress value={item.progress} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function AdminUsersTable() {
  const router = useRouter();
  const [payload, setPayload] = useState<AdminPayload | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats>(emptyAdminStats);
  const [statsReady, setStatsReady] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [membershipLevels, setMembershipLevels] = useState<Record<string, AdminMembershipLevel>>({});
  const [membershipExpiries, setMembershipExpiries] = useState<Record<string, string>>({});
  const [banReasons, setBanReasons] = useState<Record<string, string>>({});
  const [selectedUserId, setSelectedUserId] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState("");
  const [showSuspiciousOrders, setShowSuspiciousOrders] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadData() {
    setLoading(true);
    setError("");
    setStatsReady(false);
    const [response, statsResponse] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/stats")
    ]);
    const raw = (await response.json().catch(() => null)) as { data?: AdminPayload; error?: string } | AdminPayload | null;
    const rawStats = (await statsResponse.json().catch(() => null)) as { data?: AdminStats; error?: string } | AdminStats | null;
    const data = raw && "data" in raw && raw.data ? raw.data : raw;
    const statsData = rawStats && "data" in rawStats && rawStats.data ? rawStats.data : rawStats;
    setLoading(false);

    if (!response.ok) {
      setError(raw && "error" in raw ? raw.error || "读取管理员数据失败。" : "读取管理员数据失败。");
      return;
    }

    setPayload(data as AdminPayload);

    if (statsResponse.ok && statsData) {
      setAdminStats(statsData as AdminStats);
    } else {
      setAdminStats(emptyAdminStats);
    }
    setStatsReady(true);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const users = payload?.users || [];
  const emailMap = useMemo(() => new Map(users.map((user) => [user.id, user.email || user.id])), [users]);
  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => [user.email, user.role, user.id, user.last_login_ip, user.ip_country, user.ip_region, user.ip_city].join(" ").toLowerCase().includes(keyword));
  }, [search, users]);

  const filteredQuiz = useMemo(
    () => (payload?.quizRecords || []).filter((record) => !selectedUserId || record.user_id === selectedUserId),
    [payload?.quizRecords, selectedUserId]
  );
  const filteredAnalysis = useMemo(
    () => (payload?.analysisRecords || []).filter((record) => !selectedUserId || record.user_id === selectedUserId),
    [payload?.analysisRecords, selectedUserId]
  );
  const filteredWrong = useMemo(
    () =>
      (payload?.wrongQuestions || []).filter(
        (record) =>
          (!selectedUserId || record.user_id === selectedUserId) &&
          (!knowledgeFilter || record.knowledge_point === knowledgeFilter)
      ),
    [knowledgeFilter, payload?.wrongQuestions, selectedUserId]
  );
  const filteredPaymentOrders = useMemo(
    () =>
      (payload?.paymentOrders || []).filter(
        (order) =>
          (!selectedUserId || order.user_id === selectedUserId) &&
          (!showSuspiciousOrders || order.is_suspicious === true)
      ),
    [payload?.paymentOrders, selectedUserId, showSuspiciousOrders]
  );
  const knowledgePoints = useMemo(
    () => Array.from(new Set((payload?.wrongQuestions || []).map((item) => item.knowledge_point).filter(Boolean) as string[])),
    [payload?.wrongQuestions]
  );

  async function addCredits(userId: string) {
    const amount = Math.floor(amounts[userId] || 0);

    if (amount <= 0) {
      setError("请输入大于 0 的次数。");
      return;
    }

    setUpdating(userId);
    setError("");
    const response = await fetch("/api/admin/credits/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "增加次数失败。");
      return;
    }

    setAmounts((current) => ({ ...current, [userId]: 0 }));
    await loadData();
  }

  async function changeRole(userId: string, role: "admin" | "user") {
    setUpdating(userId);
    setError("");
    const response = await fetch("/api/admin/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "修改角色失败。");
      return;
    }

    await loadData();
  }

  async function updateMembership(userId: string) {
    const user = users.find((item) => item.id === userId);
    const membershipLevel = membershipLevels[userId] || user?.membership_level || "free";
    const expiryValue = membershipExpiries[userId] || "";

    setUpdating(userId);
    setError("");

    const response = await fetch("/api/admin/membership/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        membershipLevel,
        membershipExpireAt: expiryValue ? new Date(expiryValue).toISOString() : user?.membership_expire_at || null
      })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "修改会员失败。");
      return;
    }

    await loadData();
    router.refresh();
  }

  async function updateBanStatus(userId: string, banned: boolean) {
    setUpdating(userId);
    setError("");
    const response = await fetch("/api/admin/users/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        banned,
        reason: banned ? banReasons[userId] || "账号状态异常" : null
      })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "更新账号状态失败。");
      return;
    }

    await loadData();
    router.refresh();
  }

  async function setCredits(userId: string) {
    const remaining = Math.floor(amounts[userId] || 0);

    if (remaining < 0) {
      setError("剩余次数不能小于 0。");
      return;
    }

    setUpdating(userId);
    setError("");
    const response = await fetch("/api/admin/credits/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, remaining })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "修改次数失败。");
      return;
    }

    setAmounts((current) => ({ ...current, [userId]: 0 }));
    await loadData();
  }

  async function deleteAdminRecord(id: string, type: "quiz" | "analysis" | "wrong") {
    setUpdating(id);
    const endpoint = type === "wrong" ? `/api/admin/wrong-questions?id=${encodeURIComponent(id)}` : `/api/admin/records?id=${encodeURIComponent(id)}&type=${type}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    setUpdating("");

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "删除失败。");
      return;
    }

    await loadData();
  }

  async function retryAdminJob(jobId: string) {
    setUpdating(jobId);
    setError("");
    const response = await fetch("/api/admin/jobs/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "重试任务失败。");
      return;
    }

    await loadData();
  }

  async function deleteAdminJob(jobId: string) {
    setUpdating(jobId);
    const response = await fetch(`/api/admin/jobs?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "删除任务失败。");
      return;
    }

    await loadData();
  }

  async function markOrderPaid(orderId: string) {
    setUpdating(orderId);
    const response = await fetch("/api/admin/payment-orders/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "标记订单失败。");
      return;
    }

    await loadData();
  }

  async function approveManualOrder(orderId: string) {
    setUpdating(orderId);
    setError("");
    const response = await fetch("/api/admin/manual-pay/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "人工通过订单失败。");
      return;
    }

    await loadData();
  }

  async function rejectManualOrder(orderId: string) {
    const reason = window.prompt("请输入拒绝原因", "审核未通过，请联系客服处理。");

    if (reason === null) {
      return;
    }

    setUpdating(orderId);
    setError("");
    const response = await fetch("/api/admin/manual-pay/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, rejectReason: reason || "审核未通过，请联系客服处理。" })
    });
    const data = await response.json().catch(() => null);
    setUpdating("");

    if (!response.ok) {
      setError(data?.error || "拒绝订单失败。");
      return;
    }

    await loadData();
  }

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[28px] border border-slate-200 bg-white text-slate-500 shadow-card">
        管理员数据
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminStatsDashboard stats={adminStats} ready={statsReady} />

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              管理员
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">用户、记录与使用量</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75"
          >
            <RefreshCw className="h-5 w-5" />
            刷新
          </button>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {payload ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-9">
            {[
              ["总用户数", payload.stats.totalUsers],
              ["今日新增", payload.stats.todayNewUsers],
              ["今日生成", payload.stats.todayGenerations],
              ["总 Quiz", payload.stats.totalQuiz],
              ["总解析", payload.stats.totalAnalysis],
              ["总错题", payload.stats.totalWrong],
              ["AI 任务", payload.stats.totalJobs || 0],
              ["失败任务", payload.stats.failedJobs || 0],
              ["订单", payload.stats.totalOrders || 0]
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>
        ) : null}

        <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-blue-400 focus-within:bg-white">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            value={search}
            onChange={(event) => startTransition(() => setSearch(event.target.value))}
            className="w-full bg-transparent text-sm text-slate-900 outline-none"
            placeholder="搜索用户、角色、IP 或地区"
          />
          {isPending ? <span className="text-xs text-blue-600">筛选中</span> : null}
        </label>

        <div className="grid gap-3 md:hidden">
          {filteredUsers.map((user) => {
            const dailyPercent = user.daily_limit ? Math.min(1, (user.daily_used || 0) / user.daily_limit) : 0;
            const membershipLevel = membershipLevels[user.id] || user.membership_level || "free";

            return (
              <article key={user.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 transition duration-200 ease-out active:scale-[0.99] active:opacity-90">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-950">{user.email || user.id}</div>
                    <div className="mt-1 text-xs text-slate-500">{user.id}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                    {compactStatus(user)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white p-3">
                    <div className="text-xs text-slate-500">会员等级</div>
                    <div className="mt-1 font-semibold text-slate-950">{user.membership_level || "free"}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <div className="text-xs text-slate-500">剩余天数</div>
                    <div className="mt-1 font-semibold text-slate-950">{daysLeft(user.membership_expire_at)}</div>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <div className="text-xs text-slate-500">今日使用</div>
                    <div className="mt-1 font-semibold text-slate-950">{user.daily_used || 0}/{user.daily_limit || 0}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${dailyPercent * 100}%` }} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <div className="text-xs text-slate-500">月度使用</div>
                    <div className="mt-1 font-semibold text-slate-950">{user.monthly_used || 0}/{user.monthly_limit || "-"}</div>
                  </div>
                </div>

                <details className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                  <summary className="cursor-pointer font-semibold text-slate-800">详细数据</summary>
                  <div className="mt-3 space-y-2">
                    <div>剩余次数：{user.remaining}</div>
                    <div>Quiz / 解析：{user.quiz_count || 0} / {user.analysis_count || 0}</div>
                    <div>最近登录：{formatDate(user.last_login_at)}</div>
                    <div>地区：{regionText({ ip_address: user.last_login_ip, ip_country: user.ip_country, ip_region: user.ip_region, ip_city: user.ip_city })}</div>
                  </div>
                </details>

                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={membershipLevel}
                      disabled={updating === user.id}
                      onChange={(event) => setMembershipLevels((current) => ({ ...current, [user.id]: event.target.value as AdminMembershipLevel }))}
                      className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                    >
                      <option value="free">free</option>
                      <option value="pro">pro</option>
                      <option value="max">max</option>
                    </select>
                    <button
                      type="button"
                      disabled={updating === user.id}
                      onClick={() => void updateMembership(user.id)}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white transition duration-200 ease-out active:scale-[0.97] active:opacity-75 disabled:bg-amber-300"
                    >
                      保存
                    </button>
                  </div>
                  <input
                    value={banReasons[user.id] || user.ban_reason || ""}
                    onChange={(event) => setBanReasons((current) => ({ ...current, [user.id]: event.target.value }))}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
                    placeholder="账号状态备注"
                  />
                  <button
                    type="button"
                    disabled={updating === user.id}
                    onClick={() => void updateBanStatus(user.id, !user.is_banned)}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75 disabled:opacity-60"
                  >
                    {user.is_banned ? "解除异常" : "标记异常"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1680px] border-separate border-spacing-y-3 text-left text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="px-4 py-2 font-medium">邮箱</th>
                <th className="px-4 py-2 font-medium">角色</th>
                <th className="px-4 py-2 font-medium">剩余/已用</th>
                <th className="px-4 py-2 font-medium">会员/日额度</th>
                <th className="px-4 py-2 font-medium">Quiz/解析</th>
                <th className="px-4 py-2 font-medium">Token/调用</th>
                <th className="px-4 py-2 font-medium">最近登录</th>
                <th className="px-4 py-2 font-medium">最近使用</th>
                <th className="px-4 py-2 font-medium">IP/地区</th>
                <th className="px-4 py-2 font-medium">次数</th>
                <th className="px-4 py-2 font-medium">会员</th>
                <th className="px-4 py-2 font-medium">角色</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="rounded-2xl bg-slate-50 text-slate-700">
                  <td className="rounded-l-2xl px-4 py-4 font-medium text-slate-950">{user.email || user.id}</td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      <UserRoundCog className="h-4 w-4" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-4">{user.remaining} / {user.used_count || 0}</td>
                  <td className="px-4 py-4">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                      <Crown className="h-4 w-4 text-amber-500" />
                      {user.membership_level || "free"} · {user.daily_used || 0}/{user.daily_limit || 3}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{user.membership_expire_at ? formatDate(user.membership_expire_at) : "长期/未设置"}</div>
                  </td>
                  <td className="px-4 py-4">{user.quiz_count || 0} / {user.analysis_count || 0}</td>
                  <td className="px-4 py-4">{user.total_tokens || 0} / {user.total_calls || 0}</td>
                  <td className="px-4 py-4">{formatDate(user.last_login_at)}</td>
                  <td className="px-4 py-4">{formatDate(user.last_used_at)}</td>
                  <td className="px-4 py-4">{regionText({ ip_address: user.last_login_ip, ip_country: user.ip_country, ip_region: user.ip_region, ip_city: user.ip_city })}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={amounts[user.id] || ""}
                        onChange={(event) => setAmounts((current) => ({ ...current, [user.id]: Number(event.target.value) }))}
                        className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                        placeholder="10"
                      />
                        <button
                          type="button"
                          disabled={updating === user.id}
                          onClick={() => void addCredits(user.id)}
                        className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition duration-200 ease-out hover:bg-blue-700 active:scale-[0.97] active:opacity-75 disabled:bg-blue-300 disabled:opacity-75"
                        >
                          <Plus className="h-4 w-4" />
                          加
                        </button>
                        <button
                          type="button"
                          disabled={updating === user.id}
                          onClick={() => void setCredits(user.id)}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
                        >
                          设为
                        </button>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={membershipLevels[user.id] || user.membership_level || "free"}
                        disabled={updating === user.id}
                        onChange={(event) => setMembershipLevels((current) => ({ ...current, [user.id]: event.target.value as AdminMembershipLevel }))}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                      >
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="max">max</option>
                      </select>
                      <input
                        type="date"
                        value={membershipExpiries[user.id] || (user.membership_expire_at ? user.membership_expire_at.slice(0, 10) : "")}
                        onChange={(event) => setMembershipExpiries((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                      />
                      <button
                        type="button"
                        disabled={updating === user.id}
                        onClick={() => void updateMembership(user.id)}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-500 px-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:bg-amber-300"
                      >
                        保存
                      </button>
                    </div>
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <div className="flex min-w-56 flex-col gap-2">
                      <select
                        value={user.role}
                        disabled={updating === user.id}
                        onChange={(event) => void changeRole(user.id, event.target.value as "admin" | "user")}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {compactStatus(user)}
                        </span>
                        <button
                          type="button"
                          disabled={updating === user.id}
                          onClick={() => void updateBanStatus(user.id, !user.is_banned)}
                          className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition duration-200 ease-out hover:bg-slate-50 active:scale-[0.97] active:opacity-75 disabled:opacity-60"
                        >
                          {user.is_banned ? "解封" : "封号"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-950">学习记录管理</h2>
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
          >
            <option value="">全部用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.email || user.id}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Quiz Records</h3>
            {filteredQuiz.slice(0, 20).map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <Link href={`/records/${record.id}`} prefetch className="min-w-0 flex-1 active:opacity-70">
                  <div className="truncate font-medium text-slate-950">{record.quiz_title || "Quiz"}</div>
                  <div className="mt-1 text-xs text-slate-500">{emailMap.get(record.user_id || "")} · {formatDate(record.created_at)} · {regionText(record)}</div>
                </Link>
                <button type="button" onClick={() => void deleteAdminRecord(record.id, "quiz")} className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-slate-800">Analysis Records</h3>
            {filteredAnalysis.slice(0, 20).map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <Link href={`/records/${record.id}`} prefetch className="min-w-0 flex-1 active:opacity-70">
                  <div className="truncate font-medium text-slate-950">{record.recognized_text || "解析记录"}</div>
                  <div className="mt-1 text-xs text-slate-500">{emailMap.get(record.user_id || "")} · {formatDate(record.created_at)} · {regionText(record)}</div>
                </Link>
                <button type="button" onClick={() => void deleteAdminRecord(record.id, "analysis")} className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-950">错题记录管理</h2>
          <select
            value={knowledgeFilter}
            onChange={(event) => setKnowledgeFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400"
          >
            <option value="">全部知识点</option>
            {knowledgePoints.map((point) => (
              <option key={point} value={point}>{point}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredWrong.slice(0, 40).map((record) => (
            <div key={record.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <Link href={`/wrongbook/${record.id}`} prefetch className="min-w-0 flex-1 active:opacity-70">
                <div className="truncate font-medium text-slate-950">
                  <InlineQuizMathText text={record.question || "错题"} />
                </div>
                <div className="mt-1 text-xs text-slate-500">{emailMap.get(record.user_id || "")} · {record.knowledge_point || "未分类"} · {record.error_type || "未标注"}</div>
              </Link>
              <button type="button" onClick={() => void deleteAdminRecord(record.id, "wrong")} className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <h2 className="mb-4 text-xl font-semibold text-slate-950">AI 任务管理</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {(payload?.analysisJobs || []).slice(0, 40).map((record) => (
            <div key={record.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-950">{record.id}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {emailMap.get(record.user_id || "")} · {record.status || "-"} · {record.progress || 0}% · {formatDate(record.created_at)}
                  </div>
                  {record.error_message ? <div className="mt-2 line-clamp-2 text-xs text-rose-700">{record.error_message}</div> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={updating === record.id || record.status !== "failed"}
                    onClick={() => void retryAdminJob(record.id)}
                    className="rounded-full p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title="重试失败任务"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => void deleteAdminJob(record.id)} className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" title="删除任务">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-blue-100/80 bg-white/75 p-5 shadow-glass backdrop-blur-xl sm:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-950">支付订单管理</h2>
          <button
            type="button"
            onClick={() => setShowSuspiciousOrders((value) => !value)}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold transition duration-200 ease-out active:scale-[0.97] active:opacity-75 ${
              showSuspiciousOrders ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            异常订单
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredPaymentOrders.slice(0, 40).map((order) => (
            <div key={order.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                <div className="truncate font-medium text-slate-950">{emailMap.get(order.user_id || "")}</div>
                <div className="mt-1 text-xs text-slate-500">
                  用户ID {order.user_id || "-"} · {order.plan_type || order.plan || "-"} · {order.payment_method || order.pay_type || order.provider || "manual"} · {order.status || "pending"} · {formatDate(order.created_at)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  订单号 {order.order_no || order.id} · ¥{order.amount || 0} · {order.credits || 0} 次
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  OCR金额 ¥{order.extracted_amount || "-"} · 交易号 {order.extracted_trade_no || order.trade_no || "-"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  风险分 {order.risk_level ?? order.ai_risk_score ?? 0} · 是否异常 {order.is_suspicious ? "是" : "否"} · 审核 {order.reviewed ? order.review_result || "已处理" : "未处理"}
                </div>
                {order.ai_review_result ? <div className="mt-2 line-clamp-2 text-xs text-amber-700">{order.ai_review_result}</div> : null}
                {order.reject_reason ? <div className="mt-2 line-clamp-2 text-xs text-rose-700">{order.reject_reason}</div> : null}
                {order.uploaded_screenshot_url ? (
                  <a
                    href={order.uploaded_screenshot_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800"
                  >
                    查看付款截图
                  </a>
                ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {order.provider === "manual_screenshot" || order.uploaded_screenshot_url ? (
                    <>
                      <button
                        type="button"
                        disabled={updating === order.id || order.status === "paid"}
                        onClick={() => void approveManualOrder(order.id)}
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        disabled={updating === order.id || order.status === "paid"}
                        onClick={() => void rejectManualOrder(order.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                      >
                        拒绝
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={updating === order.id || order.status === "paid"}
                      onClick={() => void markOrderPaid(order.id)}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      标记 paid
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
