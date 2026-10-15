"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "../../components/icons";

type Mode = "password" | "code";

export default function PortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  async function post(path: string, body: Record<string, string>) {
    const res = await fetch(`/api/portal/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail ?? `That did not work (${res.status}).`);
    }
    return res.json();
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await post("login", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      router.replace("/portal");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await post("code", { email });
      setCodeSent(true);
      setNote(`If ${email} has a card here, a code is on its way. It lasts 30 minutes.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function useCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await post("verify", {
        email,
        code: String(form.get("code") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      router.replace("/portal");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card-page tpl-plain flex min-h-dvh items-center justify-center p-5">
      <div className="surface w-full max-w-md p-7">
        <h1 className="font-display text-2xl font-bold">Your contact card</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sign in to get your link, your QR code and your email signature.
        </p>

        {mode === "password" ? (
          <form onSubmit={signIn} className="mt-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Email</span>
              <input
                name="email"
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="field"
              />
            </label>
            <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("code");
                setError(null);
              }}
              className="w-full text-sm font-semibold text-brand-ink underline"
            >
              First time here, or forgotten the password?
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Email</span>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
              />
            </label>
            <button
              type="button"
              onClick={sendCode}
              disabled={busy || !email}
              className="btn w-full"
            >
              <Icon name="mail" className="size-4" />
              {codeSent ? "Send another code" : "Email me a code"}
            </button>

            {codeSent ? (
              <form onSubmit={useCode} className="space-y-4 border-t border-line pt-4">
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">The code</span>
                  <input
                    name="code"
                    inputMode="numeric"
                    required
                    placeholder="123456"
                    className="field text-center font-mono text-lg tracking-[0.4em]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold text-ink-soft">
                    Choose a password (10 characters or more)
                  </span>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className="field"
                  />
                </label>
                <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
                  {busy ? "Setting it…" : "Set the password and sign in"}
                </button>
              </form>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError(null);
                setNote(null);
              }}
              className="w-full text-sm font-semibold text-brand-ink underline"
            >
              Back to signing in
            </button>
          </div>
        )}

        <p aria-live="polite" className="mt-4 min-h-5 text-sm">
          {error ? (
            <span role="alert" className="confirm block rounded-lg border-l-2 border-brand bg-wash px-3 py-2">
              {error}
            </span>
          ) : note ? (
            <span className="confirm block text-ink-soft">{note}</span>
          ) : null}
        </p>

        <p className="mt-6 border-t border-line pt-4 text-xs text-ink-soft">
          Accounts are set up by your administrator. If you do not have one yet, ask them to add
          your email to your card.
        </p>
      </div>
    </main>
  );
}
