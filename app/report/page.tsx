import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LineChart, Sparkles, TrendingUp } from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RecordRow = {
  id: string;
  accuracy: number;
  question_count: number;
  correct_count: number;
  knowledge_points: string[];
  created_at: string;
};

type WrongRow = {
  knowledge_point: string | null;
  tags?: string[] | null;
};

function trendLabel(records: RecordRow[]) {
  if (records.length < 2) {
    return "完成更多练习后生成趋势";
  }

  const midpoint = Math.max(1, Math.floor(records.length / 2));
  const first = records.slice(0, midpoint);
  const last = records.slice(midpoint);
  const avg = (items: RecordRow[]) => items.reduce((total, item) => total + item.accuracy, 0) / Math.max(items.length, 1);
  const delta = Math.round((avg(last) - avg(first)) * 100);

  if (delta > 0) return `提升 ${delta}%`;
  if (delta < 0) return `下降 ${Math.abs(delta)}%`;
  return "保持稳定";
}

export default async function ReportPage() {
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: recordData }, { data: wrongData }] = await Promise.all([
    supabase
      .from("study_records")
      .select("id,accuracy,question_count,correct_count,knowledge_points,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase.from("wrong_questions").select("knowledge_point,tags").eq("user_id", user.id)
  ]);
  const records = (recordData || []) as RecordRow[];
  const wrongs = (wrongData || []) as WrongRow[];
  const totalQuestions = records.reduce((total, item) => total + (item.question_count || 0), 0);
  const totalCorrect = records.reduce((total, item) => total + (item.correct_count || 0), 0);
  const wrongCount = wrongs.length;
  const averageAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const wrongMap = new Map<string, number>();

  wrongs.forEach((item) => {
    const key = item.knowledge_point || "未分类";
    wrongMap.set(key, (wrongMap.get(key) || 0) + 1);
  });

  const topWrongPoints = Array.from(wrongMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const maxWrong = Math.max(1, ...topWrongPoints.map(([, count]) => count));
  const recentRecords = records.slice(-6);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        返回首页
      </Link>

      <section className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-card backdrop-blur sm:p-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          <LineChart className="h-4 w-4" />
          学习报告
        </div>
        <h1 className="text-3xl font-semibold text-slate-950">练习表现与提升建议</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-blue-900">
            <div className="text-sm font-medium">正确率</div>
            <div className="mt-2 text-3xl font-semibold">{averageAccuracy}%</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-slate-900">
            <div className="text-sm font-medium">总题数</div>
            <div className="mt-2 text-3xl font-semibold">{totalQuestions}</div>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-900">
            <div className="text-sm font-medium">错题数</div>
            <div className="mt-2 text-3xl font-semibold">{wrongCount}</div>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-emerald-900">
            <div className="text-sm font-medium">进步趋势</div>
            <div className="mt-2 text-2xl font-semibold">{trendLabel(records)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="mb-4 font-semibold text-slate-950">Top3 薄弱知识点</h2>
            {topWrongPoints.length === 0 ? (
              <p className="text-sm text-slate-500">暂无错题数据。</p>
            ) : (
              <div className="space-y-4">
                {topWrongPoints.map(([point, count]) => (
                  <div key={point}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{point}</span>
                      <span className="text-rose-600">{count} 次</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round((count / maxWrong) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <div className="mb-4 flex items-center gap-2 font-semibold text-blue-900">
              <TrendingUp className="h-5 w-5" />
              最近 6 次趋势
            </div>
            {recentRecords.length === 0 ? (
              <p className="text-sm text-blue-950/70">完成几组练习后，这里会显示正确率变化。</p>
            ) : (
              <div className="flex h-36 items-end gap-3">
                {recentRecords.map((record, index) => {
                  const percent = Math.round(record.accuracy * 100);

                  return (
                    <div key={record.id} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex h-28 w-full items-end rounded-full bg-white/70 p-1">
                        <div className="w-full rounded-full bg-blue-600 transition-all" style={{ height: `${Math.max(percent, 8)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-blue-900">{percent}%</span>
                      <span className="text-[11px] text-blue-900/50">#{index + 1}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold text-slate-950">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI 提升建议
          </div>
          <p className="text-sm leading-7 text-slate-600">
            {topWrongPoints.length > 0
              ? `建议优先复习「${topWrongPoints[0][0]}」，先回顾公式和典型解法，再用错题本里的智能重练按最近错题优先练 3 到 5 道。`
              : "完成几组同类型练习后，这里会根据正确率和错题知识点给出更具体的建议。"}
          </p>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}
