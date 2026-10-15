"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "../components/icons";

const SELLING: { icon: IconName; title: string; line: string }[] = [
  { icon: "card", title: "Professional digital cards", line: "One link per person, branded per company" },
  { icon: "people", title: "Manage your team easily", line: "Every branch and everyone in it, in one place" },
  { icon: "chart", title: "Detailed analytics", line: "Opens, taps and saves, per card" },
  { icon: "qr", title: "Instant sharing", line: "By link, by QR code, or in an email signature" },
  { icon: "shield", title: "Private by design", line: "No addresses, no locations, no tracking across days" },
];

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-step: the password was right, the one-time code is still owed.
  const [needsCode, setNeedsCode] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        body: new FormData(event.currentTarget),
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? "Could not sign you in.");
      if (body?.needs_code) {
        setNeedsCode(true);
        setBusy(false);
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "Could not reach the server. Is the API running on port 8000?"
          : (cause as Error).message,
      );
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login/2fa", {
        method: "POST",
        body: new FormData(event.currentTarget),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? "That code was not accepted.");
      }
      router.push("/admin");
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* --- The pitch -----------------------------------------------------
          Hidden on a phone: a sign-in form should not be below the fold. */}
      <section className="grad-shell relative hidden overflow-hidden px-12 py-12 text-white lg:flex lg:flex-col">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 top-1/4 size-[32rem] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle,#3ccfd7,transparent 70%)" }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle,#28b4be,transparent 70%)" }}
        />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/tbs-logo.png" alt="" width={40} height={38} priority />
            <span className="font-display text-base font-bold leading-tight">
              True Star
              <span className="block text-xs font-medium text-cyan">Contact cards</span>
            </span>
          </div>
          <p className="flex items-center gap-2 text-xs font-semibold text-white/60">
            {["Smart", "Professional", "Always connected"].map((word, i) => (
              <span key={word} className="flex items-center gap-2">
                {i ? <span aria-hidden="true" className="grad-cyan size-1 rounded-full" /> : null}
                {word}
              </span>
            ))}
          </p>
        </div>

        <div className="relative mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-10 py-10">
          <div className="max-w-md">
            <h2 className="font-display text-[2.6rem] font-bold leading-[1.1]">
              Digital contact cards for{" "}
              <span className="text-cyan">modern business</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Create, manage and share a card for everyone on the team. Whoever opens one taps
              once and your details land in their address book — photo, job title, every number,
              in English or Arabic.
            </p>

            <ul className="mt-8 space-y-4">
              {SELLING.map((item) => (
                <li key={item.title} className="flex items-center gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan">
                    <Icon name={item.icon} className="size-4.5" />
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="block font-display font-semibold">{item.title}</span>
                    <span className="block text-white/60">{item.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* A phone with a card in it, drawn rather than photographed: no
              stock mock-up to keep in sync, and nobody's real card on a
              sign-in page. */}
          <div
            aria-hidden="true"
            className="hidden w-60 shrink-0 rounded-[2.2rem] border-4 border-white/15 bg-shell p-2 shadow-lift xl:block"
          >
            <div className="overflow-hidden rounded-[1.7rem] bg-wash">
              <div className="grad-cyan h-20" />
              <div className="-mt-9 px-4 pb-5 text-center text-ink">
                <span className="mx-auto block size-16 rounded-full border-4 border-paper bg-line" />
                <span className="mt-2 block font-display text-sm font-bold">Your name</span>
                <span className="block text-[11px] text-ink-soft">Job title</span>
                <span className="block text-[11px] text-ink-soft">Company, branch</span>
                <span className="grad-rule mx-auto mt-2.5 block h-0.5 w-8 rounded-full" />
                <span className="mt-3 flex justify-center gap-1.5">
                  {(["phone", "mail", "globe", "pin"] as IconName[]).map((name) => (
                    <span
                      key={name}
                      className="flex size-7 items-center justify-center rounded-full bg-paper text-cyan-ink"
                    >
                      <Icon name={name} className="size-3.5" />
                    </span>
                  ))}
                </span>
                <span className="mt-3 block rounded-full bg-ink py-2 font-display text-[11px] font-semibold text-white">
                  Save contact
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- The form ------------------------------------------------------ */}
      <section className="flex items-center justify-center bg-wash px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <Image src="/tbs-logo.png" alt="" width={52} height={49} priority className="mx-auto" />
            <p className="mt-3 font-display text-xl font-bold leading-tight">
              True Star
              <span className="block text-sm font-semibold text-cyan-ink">Contact cards</span>
            </p>
          </div>

          <h1 className="mt-8 text-center font-display text-2xl font-bold">
            {needsCode ? "One more step" : "Welcome back"}
          </h1>
          <p className="mt-1 text-center text-sm text-ink-soft">
            {needsCode
              ? "Open your authenticator app and type the six digits it shows."
              : "Sign in to manage your companies, people and their cards."}
          </p>

          {needsCode ? (
            <form onSubmit={submitCode} className="surface mt-6 space-y-4 p-6">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-ink-soft">
                  Code, or one of your recovery codes
                </span>
                <input
                  name="code"
                  type="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="text"
                  placeholder="123456"
                  className="field text-center font-mono text-lg tracking-[0.3em]"
                />
              </label>

              {error ? (
                <p role="alert" className="confirm rounded-lg border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
                {busy ? "Checking…" : "Sign in"}
                {busy ? null : <Icon name="arrow-right" className="size-4" />}
              </button>

              <p className="text-center text-xs text-ink-soft">
                Lost the phone? A recovery code works here once. Out of those too — another
                administrator can switch two-step off for you.
              </p>
            </form>
          ) : (
          <form onSubmit={submit} className="surface mt-6 space-y-4 p-6">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Username or email</span>
              <span className="relative block">
                <span
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                >
                  <Icon name="mail" className="size-4" />
                </span>
                <input
                  name="email"
                  type="text"
                  required
                  autoComplete="username"
                  autoFocus
                  placeholder="you@company.com"
                  className="field pl-10"
                />
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Password</span>
              <span className="relative block">
                <span
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
                >
                  <Icon name="lock" className="size-4" />
                </span>
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="field px-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-ink"
                >
                  <Icon name={show ? "eye-off" : "eye"} className="size-4" />
                </button>
              </span>
            </label>

            {error ? (
              <p role="alert" className="confirm rounded-lg border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
              {busy ? "Signing in…" : "Sign in"}
              {busy ? null : <Icon name="arrow-right" className="size-4" />}
            </button>

            <p className="text-center text-xs text-ink-soft">
              Forgotten your password, or need an account? Any other administrator can reset it or
              create one — there is no self-service sign-up here, on purpose.
            </p>
          </form>
          )}

          <p className="mt-5 text-center text-sm text-ink-soft">
            Here for your own card?{" "}
            <Link href="/portal/login" className="font-semibold text-cyan-ink hover:underline">
              Sign in to your card
            </Link>
          </p>

          <p className="mt-8 text-center text-xs text-ink-soft">
            © {new Date().getFullYear()} True Star Business Solutions
          </p>
        </div>
      </section>
    </main>
  );
}
