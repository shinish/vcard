"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "../components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // password → code (two-step) · password → forgot → reset
  const [mode, setMode] = useState<"password" | "code" | "forgot" | "reset">("password");
  const [note, setNote] = useState<string | null>(null);

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
        setMode("code");
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

  /** Ask for a code, then set a new password with it. Both answer the same
   *  way whoever asks, so neither can be used to find real accounts. */
  async function askForCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/admin/forgot", {
        method: "POST",
        body: new FormData(event.currentTarget),
        credentials: "same-origin",
      });
      setNote("If that address has an account, a code is on its way. It lasts 30 minutes.");
      setMode("reset");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    if (body.get("new_password") !== body.get("confirm_password")) {
      setError("The two passwords do not match.");
      return;
    }
    body.delete("confirm_password");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? "That did not work.");
      }
      setNote("Password changed. Sign in with it.");
      setMode("password");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
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
    <main
      className="relative min-h-dvh bg-[#050b14]"
      style={{
        // The scene is the page: logo, tagline, phone and cards are all in it,
        // pinned to the top-left corner and covering whatever the screen is.
        backgroundImage: "url(/login-hero.webp), url(/login-hero.jpg)",
        backgroundPosition: "left top",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* --- The panel ------------------------------------------------------
          Sits over the pale right-hand side of the scene on a wide screen, and
          over its own veil on a phone, where the picture is behind the text. */}
      <section className="flex min-h-dvh items-center justify-center px-5 py-10 lg:justify-end lg:px-14">
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[#050b14]/70 backdrop-blur-sm lg:hidden"
        />
        <div className="relative w-full max-w-[24rem] rounded-2xl bg-paper/95 p-7 shadow-lift backdrop-blur-md sm:p-8">
          <div className="text-center">
            <p className="mt-3 font-display text-sm font-semibold text-brand-ink">
              Contact cards
            </p>
          </div>

          <h1 className="mt-9 text-center font-display text-[1.6rem] font-bold">
            {
              {
                password: "Welcome back",
                code: "One more step",
                forgot: "Forgotten password",
                reset: "Set a new password",
              }[mode]
            }
          </h1>
          <p className="mt-2 text-center text-sm text-ink-soft">
            {
              {
                password: "Sign in to your account to manage your digital contact cards.",
                code: "Open your authenticator app and type the six digits it shows.",
                forgot:
                  "We will email a one-time code to the address on your account. Accounts that sign in with a username are reset by another administrator.",
                reset: "Type the code from the email and the password you want.",
              }[mode]
            }
          </p>

          {note ? (
            <p aria-live="polite" className="confirm mt-4 rounded-lg bg-wash px-3 py-2 text-center text-sm">
              {note}
            </p>
          ) : null}

          {mode === "code" ? (
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
                <p role="alert" className="confirm rounded-lg border-l-2 border-brand bg-wash px-3 py-2 text-sm">
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
          ) : mode === "forgot" ? (
            <form onSubmit={askForCode} className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Your email address</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@company.com"
                  className="field py-3"
                />
              </label>
              {error ? (
                <p role="alert" className="confirm rounded-lg border-l-2 border-brand bg-wash px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5">
                {busy ? "Sending…" : "Email me a code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setError(null);
                  setNote(null);
                }}
                className="w-full text-center text-sm font-semibold text-brand-ink hover:underline"
              >
                Back to sign in
              </button>
            </form>
          ) : mode === "reset" ? (
            <form onSubmit={submitReset} className="mt-7 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Your email address</span>
                <input name="email" type="email" required className="field py-3" />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold">The code from the email</span>
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="field py-3 text-center font-mono text-lg tracking-[0.4em]"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold">New password</span>
                <input
                  name="new_password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="field py-3"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Repeat it</span>
                <input
                  name="confirm_password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="field py-3"
                />
              </label>
              {error ? (
                <p role="alert" className="confirm rounded-lg border-l-2 border-brand bg-wash px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3.5">
                {busy ? "Saving…" : "Set the password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("password");
                  setError(null);
                  setNote(null);
                }}
                className="w-full text-center text-sm font-semibold text-brand-ink hover:underline"
              >
                Back to sign in
              </button>
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-semibold">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setNote(null);
                    }}
                    className="text-xs font-semibold text-brand-ink hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
                  >
                    <Icon name="lock" className="size-4" />
                  </span>
                  <input
                    id="password"
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
              </div>

              {error ? (
                <p role="alert" className="confirm rounded-lg border-l-2 border-brand bg-wash px-3 py-2 text-sm">
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
          </p>

          <p className="mt-10 text-center text-xs text-ink-soft">
            © {new Date().getFullYear()} TrueTap
          </p>
        </div>
      </section>
    </main>
  );
}
