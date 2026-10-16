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
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
    setAccountOpen(false);
  }

  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    function refreshProfile() { apiJson<Me>("/api/admin/me").then(setMe).catch(() => {}); }
    window.addEventListener("admin-profile-updated", refreshProfile);
    apiJson<Me>("/api/admin/me")
      .then(setMe)
      .catch(() => {
        setFailed(true);
        router.replace("/login");
      });
    return () => window.removeEventListener("admin-profile-updated", refreshProfile);
  }, [router]);

  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    router.replace("/login");
  }

  if (failed) return null;
  if (!me) {
    return <main className="workspace-loading" role="status"><span className="workspace-loader" />Opening your workspace…</main>;
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
    <div data-sidebar-collapsed={collapsed} className="workspace flex min-h-dvh flex-col lg:flex-row">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      <aside className="workspace-sidebar flex shrink-0 flex-col">
        <div className="flex items-center justify-between gap-4">
        <Link href="/admin" aria-label="True Star dashboard" className="workspace-brand flex items-center gap-3">
          <Image src="/tbs-logo.png" alt="" width={42} height={40} />
          <span className="font-display text-xl font-bold leading-tight text-white">
            True Star
            <span className="block text-xs font-medium text-cyan">Contact cards</span>
          </span>
        </Link>

        <button type="button" className="workspace-menu lg:hidden" aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Close menu" : "Menu"}<Icon name="grid" className="size-4" /></button>
        </div>
        <button type="button" className="sidebar-collapse" onClick={() => { setCollapsed((value) => !value); setAccountOpen(false); }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="workspace-navigation" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}><Icon name="arrow-right" className={`size-4 ${collapsed ? "" : "rotate-180"}`} /><span>Collapse navigation</span></button>
        <nav id="workspace-navigation" aria-label="Main navigation" className={`${menuOpen ? "flex" : "hidden"} workspace-nav mt-6 flex-col gap-1 lg:flex`}>
          {nav.map((item) => {
            // /admin is the dashboard itself, so it only lights on an exact match
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href) || (item.href === "/admin/people" && pathname.startsWith("/admin/contacts"));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.text}
                title={item.text}
                data-tooltip={item.text}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-sm font-semibold transition-colors ${
                  active
                    ? "grad-brand shadow-[0_10px_20px_-14px_#2f8ad6]"
                    : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="size-4" />
                <span className="workspace-nav-label">{item.text}</span>
                <span className="sidebar-tooltip" aria-hidden="true">{item.text}</span>
              </Link>
            );
          })}
        </nav>

        <Link href="/admin/contacts/new" className="sidebar-create" aria-label="Create a contact card" title="Create a contact card"><Icon name="plus" className="size-4" /><span>Create a contact card</span></Link>

        {/* The account, at the foot of the nav: who you are is not a page
            action, and this is where a signed-in name is looked for. */}
        <div className={`${menuOpen ? "block" : "hidden"} workspace-account relative mt-6 border-t border-white/10 pt-4 lg:mt-auto lg:block`}>
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            aria-expanded={accountOpen}
            aria-label={`Account menu for ${me.name || me.email}`}
            title="Your account"
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.07]"
          >
            <span className="grad-brand flex size-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold">
              {me.photo_url ? <Image src={me.photo_url} alt="" width={36} height={36} className="size-full rounded-full object-cover" /> : (me.name || me.email).slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-tight">
              <span className="block truncate font-semibold text-white">
                {me.name || me.email}
              </span>
              <span className="block text-white/55">Administrator</span>
            </span>
            <Icon name="arrow-right" className="size-4 -rotate-90 text-white/45" />
          </button>

          {accountOpen ? (
            <div className="account-popover surface absolute bottom-full left-0 right-0 z-30 mb-2 p-2">
              <Link
                href="/admin/profile"
                onClick={() => setAccountOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-wash"
              >
                Your profile
              </Link>
              <Link
                href="/admin/settings"
                onClick={() => setAccountOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-wash"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-wash"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar name={me.name || me.email} photoUrl={me.photo_url} />
        <main id="workspace-content" tabIndex={-1} className="workspace-content min-w-0 flex-1">
          <div className="workspace-page mx-auto max-w-6xl">{children}</div>
        </main>
        <div className="workspace-status"><span><span className="status-indicator" aria-hidden="true" />Signed in<span className="status-account"> as {me.name || me.email}</span></span><span>Contact cards</span></div>
        <footer className="workspace-footer">Product by <strong>Kryil Infotech Private Limited.</strong></footer>
      </div>
    </div>
  );
}
