"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenCheck, ClipboardList, Home, LineChart, UserCircle } from "lucide-react";

const items = [
  { href: "/", label: "拍题", Icon: Home },
  { href: "/wrongbook", label: "错题本", Icon: BookOpenCheck },
  { href: "/records", label: "记录", Icon: ClipboardList },
  { href: "/report", label: "报告", Icon: LineChart },
  { href: "/me", label: "我的", Icon: UserCircle }
];

export default function MobileBottomNav() {
  const router = useRouter();
  const [navLoading, setNavLoading] = useState(false);

  function go(path: string) {
    setNavLoading(true);

    function go(path: string) {
  setNavLoading(true);
  router.push(path);
}
  }

  return (
    <>
      {navLoading ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xl">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              正在切换页面...
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {items.map(({ href, label, Icon }) => (
            <button
              key={href}
              type="button"
              onClick={() => go(href)}
              disabled={navLoading}
              className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium text-slate-500 transition active:bg-slate-100 disabled:opacity-60"
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
