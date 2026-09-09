"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type Props = {
  user: { name?: string | null; email?: string | null; isAdmin?: boolean };
};

const LINKS = [
  { href: "/", label: "예약 현황" },
  { href: "/my", label: "내 예약" },
];

export default function Header({ user }: Props) {
  const pathname = usePathname();
  const links = user.isAdmin ? [...LINKS, { href: "/admin", label: "관리" }] : LINKS;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="text-base font-semibold tracking-tight">
          세미나실 예약
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-muted hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">
            {user.name ?? user.email}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
