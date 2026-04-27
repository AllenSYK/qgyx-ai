import Link from "next/link";
import { BookOpenCheck, ClipboardList, Home, LineChart, UserCircle } from "lucide-react";

const items = [
  { href: "/", label: "拍题", Icon: Home },
  { href: "/wrongbook", label: "错题本", Icon: BookOpenCheck },
  { href: "/records", label: "记录", Icon: ClipboardList },
  { href: "/report", label: "报告", Icon: LineChart },
  { href: "/me", label: "我的", Icon: UserCircle }
];

export default function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium text-slate-500 active:bg-slate-100">
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
