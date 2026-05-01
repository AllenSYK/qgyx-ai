"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpenCheck, Camera, Home, UserCircle } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Home", Icon: Home },
  { href: "/", label: "Upload", Icon: Camera },
  { href: "/wrongbook", label: "Wrongbook", Icon: BookOpenCheck },
  { href: "/me", label: "Profile", Icon: UserCircle }
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [pendingPath, setPendingPath] = useState("");

  useEffect(() => {
    setPendingPath("");
  }, [pathname]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-3 z-40 px-4 pb-[env(safe-area-inset-bottom)] md:hidden">
        {pendingPath ? <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-600" /> : null}
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-[32px] border border-white/80 bg-white/78 p-2 shadow-[0_-10px_40px_rgba(29,78,216,0.16)] backdrop-blur-xl">
          {items.map(({ href, label, Icon }) => {
            const active = (pendingPath || pathname) === href;

            return (
              <Link
                key={href}
                href={href}
                prefetch
                onClick={() => {
                  if (pathname !== href) setPendingPath(href);
                }}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[24px] px-2 py-2 text-[11px] font-semibold transition active:scale-95 disabled:opacity-60 ${
                  active ? "bg-blue-50 text-blue-800 shadow-sm" : "text-slate-500 active:bg-blue-50"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
