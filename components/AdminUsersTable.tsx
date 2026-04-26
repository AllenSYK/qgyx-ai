"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, ShieldCheck, UserRoundCog } from "lucide-react";
import type { AdminQuizSessionRow, AdminUserRow } from "@/types/quiz";

type AdminPayload = {
  users: AdminUserRow[];
  recentSessions: AdminQuizSessionRow[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function AdminUsersTable() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [recentSessions, setRecentSessions] = useState<AdminQuizSessionRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/users");
    const data = (await response.json().catch(() => null)) as AdminPayload | { error?: string } | null;
    setLoading(false);

    if (!response.ok) {
      setError(data && "error" in data ? data.error || "读取管理员数据失败。" : "读取管理员数据失败。");
      return;
    }

    const payload = data as AdminPayload;
    setUsers(payload.users);
    setRecentSessions(payload.recentSessions);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function addCredits(userId: string) {
    const amount = Math.floor(amounts[userId] || 0);

    if (amount <= 0) {
      setError("请输入大于 0 的增加次数。");
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

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              管理员
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">用户与次数管理</h1>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在加载
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-separate border-spacing-y-3 text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="px-4 py-2 font-medium">邮箱</th>
                  <th className="px-4 py-2 font-medium">角色</th>
                  <th className="px-4 py-2 font-medium">剩余次数</th>
                  <th className="px-4 py-2 font-medium">已购买</th>
                  <th className="px-4 py-2 font-medium">注册时间</th>
                  <th className="px-4 py-2 font-medium">加次数</th>
                  <th className="px-4 py-2 font-medium">改角色</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="rounded-2xl bg-slate-50 text-slate-700">
                    <td className="rounded-l-2xl px-4 py-4 font-medium text-slate-950">{user.email || user.id}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                        <UserRoundCog className="h-4 w-4" />
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-4">{user.remaining}</td>
                    <td className="px-4 py-4">{user.total_purchased}</td>
                    <td className="px-4 py-4">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={amounts[user.id] || ""}
                          onChange={(event) =>
                            setAmounts((current) => ({
                              ...current,
                              [user.id]: Number(event.target.value)
                            }))
                          }
                          className="h-10 w-24 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                          placeholder="10"
                        />
                        <button
                          type="button"
                          disabled={updating === user.id}
                          onClick={() => void addCredits(user.id)}
                          className="inline-flex h-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
                        >
                          {updating === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          增加
                        </button>
                      </div>
                    </td>
                    <td className="rounded-r-2xl px-4 py-4">
                      <select
                        value={user.role}
                        disabled={updating === user.id}
                        onChange={(event) => void changeRole(user.id, event.target.value as "admin" | "user")}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-blue-400"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <h2 className="mb-4 text-xl font-semibold text-slate-950">最近 Quiz 记录</h2>
        {recentSessions.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">暂无记录</p>
        ) : (
          <div className="space-y-3">
            {recentSessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-2 rounded-2xl bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-slate-950">{session.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{session.user_email || session.user_id || "未知用户"}</div>
                </div>
                <div className="text-sm text-slate-500">{formatDate(session.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
