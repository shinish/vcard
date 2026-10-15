"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon, type IconName } from "../components/icons";

const SELLING: { icon: IconName; title: string; line: string }[] = [
  { icon: "card", title: "Professional", line: "digital cards" },
  { icon: "people", title: "Manage your", line: "team easily" },
  { icon: "chart", title: "Detailed", line: "analytics" },
  { icon: "share", title: "Instant sharing", line: "via QR or link" },
  { icon: "shield", title: "Secure and", line: "privacy focused" },
];

const FACTS = [
  { value: "22", label: "character share links" },
  { value: "4", label: "card languages" },
  { value: "vCard 3.0", label: "on every phone" },
];

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <main className="relative min-h-dvh bg-[#050b14] lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* --- The stage -----------------------------------------------------
          Navy, with the logo's gold carried through as ribbons of light. The
          phone and the cards behind it are drawn, not photographed: nothing
          to keep in sync, and no real card on a sign-in page. */}
      <section className="relative hidden overflow-hidden px-14 py-10 text-white lg:flex lg:flex-col">
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 18% 8%, #11243c 0%, #0a1628 42%, #050b14 100%)",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute -right-24 top-10 h-[34rem] w-[34rem] rounded-full opacity-25 blur-[90px]"
          style={{ background: "radial-gradient(circle,#2f6ea8,transparent 65%)" }}
        />
        {/* the gold ribbons */}
        {[
          { top: "56%", rotate: "-13deg", height: "2rem", opacity: 0.8, blur: "7px" },
          { top: "70%", rotate: "-9deg", height: "0.9rem", opacity: 0.5, blur: "5px" },
          { top: "80%", rotate: "-6deg", height: "0.4rem", opacity: 0.3, blur: "3px" },
        ].map((ribbon) => (
          <span
            key={ribbon.top}
            aria-hidden="true"
            className="absolute right-[-6%] left-[42%]"
            style={{
              top: ribbon.top,
              height: ribbon.height,
              opacity: ribbon.opacity,
              transform: `rotate(${ribbon.rotate})`,
              filter: `blur(${ribbon.blur})`,
              borderRadius: "999px",
              background:
                "linear-gradient(90deg,transparent 0%,rgba(244,160,28,0.2) 14%," +
                "rgba(255,206,122,0.95) 48%,rgba(244,160,28,0.65) 68%,transparent 95%)",
            }}
          />
        ))}

        <div className="relative flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/tbs-logo.png" alt="" width={44} height={42} priority />
            <span className="font-display text-lg font-bold leading-tight">
              True Star
              <span className="block text-xs font-medium text-cyan">Contact cards</span>
            </span>
          </div>
          <p className="flex items-center gap-3 text-sm font-medium text-white/70">
            {["Smart", "Professional", "Always Connected"].map((word, i) => (
              <span key={word} className="flex items-center gap-3">
                {i ? (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-[#f4a01c]" />
                ) : null}
                {word}
              </span>
            ))}
          </p>
        </div>

        <div className="relative mt-12 grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-start gap-8">
          <div className="max-w-lg">
            <h2 className="font-display text-[2.9rem] font-bold leading-[1.08] tracking-tight">
              Digital
              <br />
              Contact Cards
              <br />
              for <span className="text-cyan">Modern Businesses</span>
            </h2>
            <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-white/70">
              Create, manage and share professional digital contact cards for your team. A
              smarter way to connect, network and grow.
            </p>

            <ul className="mt-9 space-y-4">
              {SELLING.map((item) => (
                <li key={item.title} className="flex items-center gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-cyan backdrop-blur">
                    <Icon name={item.icon} className="size-5" />
                  </span>
                  <span className="font-display text-[0.95rem] font-semibold leading-tight">
                    {item.title}
                    <span className="block font-sans font-normal text-white/60">{item.line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* the phone, with two cards leaning behind it */}
          <div aria-hidden="true" className="relative hidden w-[26rem] pt-4 xl:block">
            <span className="absolute left-0 top-[15.5rem] flex h-32 w-40 -rotate-[14deg] flex-col items-start justify-center gap-2 rounded-2xl bg-gradient-to-br from-white to-[#e4ecf5] px-4 shadow-lift">
              <span className="block h-2.5 w-16 rounded-full bg-[#17365d]/80" />
              <span className="block h-1.5 w-24 rounded-full bg-[#17365d]/25" />
              <span className="block h-1.5 w-20 rounded-full bg-[#17365d]/15" />
              <span className="mt-1 block h-5 w-5 rounded-md bg-[#f4a01c]" />
            </span>
            <span className="absolute right-0 top-10 flex h-28 w-36 rotate-[12deg] flex-col items-start justify-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-br from-[#1b2b45] to-[#0a1322] px-4 shadow-lift">
              <span className="block h-2 w-14 rounded-full bg-white/50" />
              <span className="block h-1.5 w-20 rounded-full bg-white/20" />
              <span className="block h-1.5 w-16 rounded-full bg-white/10" />
            </span>

            <div className="relative mx-auto w-[16.5rem] rounded-[2.4rem] border-[6px] border-[#1d2a3d] bg-[#0b1420] p-1.5 shadow-lift">
              <div className="overflow-hidden rounded-[1.9rem] bg-white">
                <div className="relative h-24 bg-gradient-to-br from-[#15365c] via-[#1d4d7c] to-[#0e2742]">
                  <span className="absolute inset-x-0 bottom-0 h-8 bg-[radial-gradient(60%_140%_at_50%_120%,rgba(244,160,28,0.9),transparent_70%)]" />
                  <span className="absolute left-1/2 top-3 -translate-x-1/2 font-display text-[10px] font-bold text-white">
                    True Star
                  </span>
                </div>
                <div className="-mt-8 px-4 pb-4 text-center">
                  <span className="relative mx-auto block size-16 overflow-hidden rounded-full border-[3px] border-white bg-[#dfe7ef] shadow-soft">
                    <span className="absolute left-1/2 top-2.5 size-6 -translate-x-1/2 rounded-full bg-[#aab8c8]" />
                    <span className="absolute -bottom-3 left-1/2 size-11 -translate-x-1/2 rounded-full bg-[#aab8c8]" />
                  </span>
                  <span className="mt-2 block font-display text-[13px] font-bold text-ink">
                    Your name
                  </span>
                  <span className="block text-[10px] text-ink-soft">Job title</span>
                  <span className="block text-[10px] text-ink-soft">Company, branch</span>

                  <span className="mt-3 flex justify-center gap-2">
                    {(
                      [
                        ["phone", "#1aa260"],
                        ["mail", "#2f6ea8"],
                        ["link", "#0a66c2"],
                        ["globe", "#6b3fc4"],
                      ] as [IconName, string][]
                    ).map(([name, tint]) => (
                      <span
                        key={name}
                        className="flex size-8 items-center justify-center rounded-full text-white"
                        style={{ background: tint }}
                      >
                        <Icon name={name} className="size-3.5" />
                      </span>
                    ))}
                  </span>

                  <span className="mt-3 block space-y-1.5 text-left">
                    {["+968 2456 7890", "you@company.com", "Muscat, Oman"].map((line) => (
                      <span key={line} className="flex items-center gap-1.5 text-[10px] text-ink-soft">
                        <span className="size-1 rounded-full bg-line" />
                        {line}
                      </span>
                    ))}
                  </span>

                  <span className="mt-3 flex items-center gap-2">
                    <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#15365c] py-2 font-display text-[11px] font-semibold text-white">
                      <Icon name="download" className="size-3" />
                      Save Contact
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-[#15365c] text-white">
                      <Icon name="qr" className="size-4" />
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <dl className="relative mt-8 flex gap-10 border-t border-white/10 pt-6">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="font-display text-2xl font-bold text-cyan">{fact.value}</dt>
              <dd className="text-xs text-white/55">{fact.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --- The panel ------------------------------------------------------ */}
      <section className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12 lg:min-h-0 lg:rounded-l-[2rem]">
        <div className="w-full max-w-[22rem]">
          <div className="text-center">
            <Image src="/tbs-logo.png" alt="" width={58} height={55} priority className="mx-auto" />
            <p className="mt-3 font-display text-[1.65rem] font-bold leading-none text-[#15365c]">
              True Star
            </p>
            <p className="mt-1.5 font-display text-sm font-semibold text-cyan-ink">
              Contact cards
            </p>
          </div>

          <h1 className="mt-9 text-center font-display text-[1.6rem] font-bold">
            {needsCode ? "One more step" : "Welcome back"}
          </h1>
          <p className="mt-2 text-center text-sm text-ink-soft">
            {needsCode
              ? "Open your authenticator app and type the six digits it shows."
              : "Sign in to your account to manage your digital contact cards."}
          </p>

          {needsCode ? (
            <form onSubmit={submitCode} className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Code, or a recovery code</span>
                <input
                  name="code"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="field py-3 text-center font-mono text-lg tracking-[0.4em]"
                />
              </label>

              {error ? (
                <p role="alert" className="confirm rounded-lg border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5">
                {busy ? "Checking…" : "Sign in"}
                {busy ? null : <Icon name="arrow-right" className="size-4" />}
              </button>

              <p className="text-center text-xs text-ink-soft">
                Lost the phone? A recovery code works here once.
              </p>
            </form>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Email address or username</span>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
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
                    className="field py-3 pl-11"
                  />
                </span>
              </label>

              <label className="block space-y-2">
                <span className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Password</span>
                  <span className="text-xs text-ink-soft">Another admin can reset it</span>
                </span>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
                  >
                    <Icon name="lock" className="size-4" />
                  </span>
                  <input
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="field py-3 pl-11 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:text-ink"
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

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-display text-sm font-semibold text-white shadow-[0_12px_24px_-14px_#15365c] disabled:opacity-60"
                style={{ backgroundImage: "linear-gradient(135deg,#1d6fb8,#15365c)" }}
              >
                {busy ? "Signing in…" : "Sign in"}
                {busy ? null : <Icon name="arrow-right" className="size-4" />}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-ink-soft">
            No account? <span className="font-semibold text-ink">Contact your administrator</span>
            <span className="mt-1 block">
              Here for your own card?{" "}
              <Link href="/portal/login" className="font-semibold text-cyan-ink hover:underline">
                Sign in to your card
              </Link>
            </span>
          </p>

          <p className="mt-10 text-center text-xs text-ink-soft">
            © {new Date().getFullYear()} True Star Business Solutions
          </p>
        </div>
      </section>
    </main>
  );
}
