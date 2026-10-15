"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import TopBar from "../components/TopBar";
import { Icon, type IconName } from "../components/icons";
import { type Me, apiJson } from "../lib/api";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiJson<Me>("/api/admin/me")
      .then(setMe)
      .catch(() => {
        setFailed(true);
        router.replace("/login");
      });
  }, [router]);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    router.replace("/login");
  }

  if (failed) return null;
  if (!me) {
    return <main className="p-10 text-ink-soft">Loading…</main>;
  }

  const nav: { href: string; text: string; icon: IconName }[] = [
    { href: "/admin", text: "Dashboard", icon: "grid" },
    { href: "/admin/companies", text: "Companies", icon: "building" },
    { href: "/admin/people", text: "People", icon: "user" },
    { href: "/admin/templates", text: "Card templates", icon: "qr" },
    { href: "/admin/analytics", text: "Analytics", icon: "chart" },
    { href: "/admin/administrators", text: "Administrators", icon: "people" },
    { href: "/admin/settings", text: "Settings", icon: "gear" },
    { href: "/admin/help", text: "Help", icon: "help" },
  ];

  return (
    <div className="flex min-h-dvh flex-col sm:flex-row">
      <aside className="grad-shell flex shrink-0 flex-col px-5 py-4 sm:w-64 sm:py-6">
        <Link href="/admin" className="flex items-center gap-3">
          <Image src="/tbs-logo.png" alt="" width={34} height={32} />
          <span className="font-display text-sm font-bold leading-tight text-white">
            True Star
            <span className="block text-xs font-medium text-cyan">Contact cards</span>
          </span>
        </Link>

        <nav className="mt-4 flex flex-wrap gap-1 sm:mt-8 sm:flex-col">
          {nav.map((item) => {
            // /admin is the dashboard itself, so it only lights on an exact match
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 font-display text-sm font-semibold transition-colors ${
                  active ? "grad-cyan" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="size-4" />
                {item.text}
              </Link>
            );
          })}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar me={me} onSignOut={signOut} />
        <main className="min-w-0 flex-1 px-5 py-8 sm:px-9">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
