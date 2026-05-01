"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Crown, QrCode, Sparkles, UploadCloud, XCircle } from "lucide-react";
import {
  MEMBERSHIP_PLAN_LIST,
  membershipPlanBenefitText,
  type MembershipPlanType
} from "@/lib/membership-plans";

type PlanType = MembershipPlanType;
type PaymentMethod = "wechat" | "alipay";
type OrderStatus = "pending" | "reviewing" | "paid" | "rejected" | "failed";

type ManualOrder = {
  orderNo: string;
  status: OrderStatus;
  planType: PlanType;
  amount: number;
  membershipDays: number;
  paymentMethod: PaymentMethod;
  qrCodes: {
    wechat?: string;
    alipay?: string;
  };
  extractedTradeNo?: string | null;
  rejectReason?: string | null;
};

const payPlans = MEMBERSHIP_PLAN_LIST;

function statusText(status: OrderStatus) {
  if (status === "paid") return "已开通";
  if (status === "reviewing") return "已提交";
  if (status === "rejected") return "审核未通过";
  if (status === "failed") return "支付异常";
  return "待付款";
}

export default function MembershipPanel({
  membershipLevel,
  membershipExpireAt
}: {
  membershipLevel?: string | null;
  membershipExpireAt?: string | null;
}) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wechat");
  const [loadingPlan, setLoadingPlan] = useState("");
  const [uploading, setUploading] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [activeOrder, setActiveOrder] = useState<ManualOrder | null>(null);

  const activeQr = useMemo(() => {
    if (!activeOrder) return "";
    return activeOrder.qrCodes[activeOrder.paymentMethod] || "";
  }, [activeOrder]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status === "paid" || activeOrder.status === "rejected" || activeOrder.status === "failed") {
      return;
    }

    let stopped = false;
    const orderNo = activeOrder.orderNo;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/manual-pay/status?orderNo=${encodeURIComponent(orderNo)}`);
        const raw = await response.json().catch(() => null);
        const payload = raw?.data || raw;
        const order = payload?.order;

        if (!response.ok || !order || stopped) {
          return;
        }

        const nextStatus = (order.status || "pending") as OrderStatus;
        setActiveOrder((current) =>
          current?.orderNo === orderNo
            ? {
                ...current,
                status: nextStatus,
                extractedTradeNo: order.extracted_trade_no ?? current.extractedTradeNo,
                rejectReason: order.reject_reason ?? current.rejectReason
              }
            : current
        );

        if (nextStatus === "paid") {
          setMessage("支付审核通过，会员权益已刷新。");
          router.refresh();
        }

        if (nextStatus === "rejected") {
          setMessage("审核未通过，请联系客服处理。");
        }
      } catch {
        // Keep polling quiet; users can refresh or contact support.
      }
    }

    void pollStatus();
    const timer = window.setInterval(() => void pollStatus(), 3000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeOrder, router]);

  async function createOrder(plan: PlanType) {
    setLoadingPlan(plan);
    setMessage("");
    setProofFile(null);

    try {
      const response = await fetch("/api/manual-pay/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ planType: plan, paymentMethod })
      });
      const raw = await response.json().catch(() => null);
      const payload = raw?.data || raw;

      if (!response.ok) {
        setMessage(raw?.error || "创建支付订单失败，请稍后再试。");
        return;
      }

      setActiveOrder({
        orderNo: payload.orderNo,
        status: payload.order?.status || "pending",
        planType: payload.plan?.planType || plan,
        amount: Number(payload.plan?.amount || payload.order?.amount || 0),
        membershipDays: Number(payload.plan?.membershipDays || 0),
        paymentMethod,
        qrCodes: payload.qrCodes || {}
      });
      setMessage("订单已创建。付款备注必须填写订单号，付款成功后上传截图。");
    } finally {
      setLoadingPlan("");
    }
  }

  async function uploadProof() {
    if (!activeOrder) {
      setMessage("请先创建订单。");
      return;
    }

    if (!proofFile) {
      setMessage("请先选择付款成功截图。");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("orderNo", activeOrder.orderNo);
      formData.append("file", proofFile);
      const response = await fetch("/api/manual-pay/upload-proof", {
        method: "POST",
        body: formData
      });
      const raw = await response.json().catch(() => null);
      const payload = raw?.data || raw;

      if (!response.ok) {
        setMessage(raw?.error || "上传付款截图失败，请稍后再试。");
        return;
      }

      setActiveOrder((current) =>
        current
          ? {
              ...current,
              status: payload.status || payload.order?.status || "reviewing",
              extractedTradeNo: payload.order?.extracted_trade_no ?? current.extractedTradeNo,
              rejectReason: payload.order?.reject_reason ?? current.rejectReason
            }
          : current
      );
      setMessage(`${payload.message || "付款已提交，请联系客服确认后开通"}\n客服${payload.contact || "微信：15155132939"}`);

      if (payload.status === "paid") {
        router.refresh();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-5 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-950">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Crown className="h-5 w-5" />
            开通会员 / 续费会员
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-900/80">
            当前等级：{membershipLevel || "free"}
            {membershipExpireAt ? `，到期：${new Date(membershipExpireAt).toLocaleDateString("zh-CN")}` : ""}
          </p>
        </div>

        <div className="inline-flex rounded-2xl border border-amber-200 bg-white p-1 text-sm font-semibold shadow-sm">
          {[
            ["wechat", "微信"],
            ["alipay", "支付宝"]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPaymentMethod(value as PaymentMethod)}
              className={`rounded-xl px-3 py-2 transition duration-200 ease-out active:scale-[0.97] active:opacity-75 ${
                paymentMethod === value ? "bg-amber-500 text-white shadow-sm" : "text-amber-900 hover:bg-amber-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {payPlans.map((item) => (
          <div key={item.type} className="rounded-2xl bg-white/85 p-4 shadow-sm ring-1 ring-amber-100/70">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{item.title}</div>
                <div className="mt-1 text-2xl font-semibold">{item.priceLabel}</div>
              </div>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                {item.badge}
              </span>
            </div>
            <p className="mt-3 min-h-12 text-sm leading-6 text-amber-900/75">{item.description}</p>
            <button
              type="button"
              onClick={() => void createOrder(item.type)}
              disabled={Boolean(loadingPlan)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition duration-200 ease-out hover:-translate-y-0.5 hover:bg-amber-600 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-amber-300 disabled:opacity-75"
            >
              <Sparkles className="h-4 w-4" />
              生成订单
            </button>
          </div>
        ))}
      </div>

      {activeOrder ? (
        <div className="mt-4 rounded-3xl border border-amber-200 bg-white p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex h-44 w-full items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 lg:w-44">
              {activeQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeQr} alt="收款码" className="h-full w-full rounded-2xl object-contain p-2" />
              ) : (
                <div className="px-4 text-center text-xs leading-5 text-amber-800">
                  <QrCode className="mx-auto mb-2 h-8 w-8" />
                  收款码未配置，请联系客服
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  {activeOrder.paymentMethod === "wechat" ? "微信" : "支付宝"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeOrder.status === "paid" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
                  {activeOrder.status === "reviewing" ? <Clock3 className="h-3.5 w-3.5 text-amber-600" /> : null}
                  {activeOrder.status === "rejected" ? <XCircle className="h-3.5 w-3.5 text-rose-600" /> : null}
                  {statusText(activeOrder.status)}
                </span>
              </div>

              <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3">
                <div className="text-xs font-semibold text-amber-700">付款备注必须填写订单号</div>
                <div className="mt-1 break-all text-lg font-semibold text-amber-950">{activeOrder.orderNo}</div>
              </div>

              <div className="mt-3 grid gap-2 text-xs leading-5 text-amber-900/80 sm:grid-cols-2">
                <div>订单号：{activeOrder.orderNo}</div>
                <div>金额：¥{activeOrder.amount}</div>
                <div>支付方式：{activeOrder.paymentMethod === "wechat" ? "微信" : "支付宝"}</div>
                <div>交易号：{activeOrder.extractedTradeNo || "提交后由客服核对"}</div>
                <div>状态：{statusText(activeOrder.status)}</div>
                <div>权益：{membershipPlanBenefitText(activeOrder.planType)}</div>
              </div>

              {activeOrder.status !== "paid" && activeOrder.status !== "rejected" ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-3 font-semibold text-amber-900 transition duration-200 ease-out hover:bg-amber-50 active:scale-[0.97] active:opacity-75">
                    <UploadCloud className="h-4 w-4" />
                    {proofFile ? proofFile.name : "选择付款成功截图"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void uploadProof()}
                    disabled={uploading || !proofFile}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white transition duration-200 ease-out hover:bg-amber-600 active:scale-[0.97] active:opacity-75 disabled:cursor-not-allowed disabled:bg-amber-300 disabled:opacity-75"
                  >
                    <UploadCloud className="h-4 w-4" />
                    提交截图
                  </button>
                </div>
              ) : null}

              {activeOrder.status === "reviewing" ? (
                <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  付款已提交，请联系客服确认后开通
                  <br />
                  客服微信：15155132939
                </div>
              ) : null}

              {activeOrder.status === "rejected" ? (
                <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {activeOrder.rejectReason || "审核未通过，请联系客服处理。"}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-amber-900">
          {message.split("\n").map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
