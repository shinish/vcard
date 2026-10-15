"use client";

import { useEffect, useState } from "react";

import { Icon } from "../../components/icons";
import { type Me, api, apiJson } from "../../lib/api";

type TwoStep = { enabled: boolean; recovery_left: number };

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);
  const [detailsErr, setDetailsErr] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [twoStep, setTwoStep] = useState<TwoStep | null>(null);
  const [enrolling, setEnrolling] = useState<{ secret: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [twoErr, setTwoErr] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Me>("/api/admin/me").then(setMe).catch(() => {});
    loadTwoStep();
  }, []);

  function loadTwoStep() {
    apiJson<TwoStep>("/api/admin/me/2fa").then(setTwoStep).catch(() => {});
  }

  /** Every two-step call answers the same shape, so one helper covers them. */
  async function twoStepCall(path: string, body?: FormData) {
    setBusy(true);
    setTwoErr(null);
    try {
      const res = await api(`/api/admin/me/2fa${path}`, { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail ?? `That did not work (${res.status}).`);
      return data as Record<string, unknown>;
    } catch (cause) {
      setTwoErr((cause as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: FormData): Promise<Record<string, unknown>> {
    const res = await api("/api/admin/me", { method: "PATCH", body });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail ?? `Could not save (${res.status}).`);
    }
    return res.json();
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setDetailsErr(null);
    setDetailsMsg(null);
    try {
      const saved = await patch(new FormData(event.currentTarget));
      setMe((m) => (m ? { ...m, email: String(saved.email), name: saved.name as string } : m));
      setDetailsMsg("Saved.");
    } catch (cause) {
      setDetailsErr((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    if (body.get("new_password") !== body.get("confirm_password")) {
      setPwErr("The two new passwords do not match.");
      return;
    }
    body.delete("confirm_password");
    setBusy(true);
    setPwErr(null);
    setPwMsg(null);
    try {
      await patch(body);
      form.reset();
      setPwMsg("Password changed. Any other device signed in as you has been signed out.");
    } catch (cause) {
      setPwErr((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <p className="text-ink-soft">Loading…</p>;

  const input = "field";
  const labelled = "block text-sm font-semibold text-ink-soft";
  const button =
    "btn btn-primary";

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold">Your profile</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Administrators manage every company.
        </p>
      </header>

      <form onSubmit={saveDetails} className="mb-7 max-w-xl border border-line bg-paper p-6">
        <h2 className="font-display text-lg font-bold">Details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={labelled}>Username or email</span>
            <input name="email" type="text" required minLength={3} defaultValue={me.email} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className={labelled}>Display name</span>
            <input name="name" defaultValue={me.name ?? ""} className={input} />
          </label>
        </div>
        {detailsErr ? (
          <p role="alert" className="mt-4 border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
            {detailsErr}
          </p>
        ) : null}
        {detailsMsg ? (
          <p aria-live="polite" className="confirm mt-4 text-sm">
            {detailsMsg}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`mt-5 ${button}`}>
          Save details
        </button>
      </form>

      <form onSubmit={savePassword} className="surface max-w-xl p-6">
        <h2 className="font-display text-lg font-bold">Change password</h2>
        <p className="mt-1 text-sm text-ink-soft">
          At least 10 characters. Changing it signs you out on every other device.
        </p>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className={labelled}>Current password</span>
            <input
              name="current_password"
              type="password"
              required
              autoComplete="current-password"
              className={input}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className={labelled}>New password</span>
              <input
                name="new_password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className={input}
              />
            </label>
            <label className="block space-y-1.5">
              <span className={labelled}>Repeat new password</span>
              <input
                name="confirm_password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                className={input}
              />
            </label>
          </div>
        </div>
        {pwErr ? (
          <p role="alert" className="mt-4 border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
            {pwErr}
          </p>
        ) : null}
        {pwMsg ? (
          <p aria-live="polite" className="confirm mt-4 text-sm">
            {pwMsg}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={`mt-5 ${button}`}>
          Change password
        </button>
      </form>

      <section className="surface mt-7 p-6">
        <h2 className="font-display text-lg font-bold">Two-step verification</h2>
        <p className="mt-1 text-sm text-ink-soft">
          A six-digit code from an authenticator app, on top of your password. Nothing is sent by
          email or SMS — the code is generated on your phone, so it works with no signal.
        </p>

        {twoErr ? (
          <p role="alert" className="mt-4 border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
            {twoErr}
          </p>
        ) : null}

        {codes ? (
          <div className="mt-4 rounded-xl border border-line bg-wash p-4">
            <h3 className="font-display text-sm font-bold">Your recovery codes</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Shown once. Each works a single time, in place of the app, if you lose the phone.
              Keep them somewhere that is not the phone.
            </p>
            <ul className="mt-3 grid gap-1 font-mono text-sm sm:grid-cols-2">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
                className="btn"
              >
                Copy them
              </button>
              <button type="button" onClick={() => setCodes(null)} className="btn">
                I have saved them
              </button>
            </div>
          </div>
        ) : null}

        {!twoStep ? (
          <p className="mt-4 text-sm text-ink-soft">Loading…</p>
        ) : twoStep.enabled ? (
          <>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
              <Icon name="check" className="size-4 text-cyan-ink" />
              On — {twoStep.recovery_left} recovery{" "}
              {twoStep.recovery_left === 1 ? "code" : "codes"} left
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                // The second argument is the button that submitted: without it
                // FormData leaves the submitter out, and both buttons here
                // would read as the same action.
                const submitter = (event.nativeEvent as SubmitEvent)
                  .submitter as HTMLButtonElement | null;
                const form = event.currentTarget;
                const body = new FormData(form, submitter ?? undefined);
                const action = String(body.get("action"));
                const done = await twoStepCall(
                  action === "off" ? "/off" : "/recovery",
                  body,
                );
                if (!done) return;
                form.reset();
                if (done.recovery_codes) setCodes(done.recovery_codes as string[]);
                loadTwoStep();
              }}
              className="mt-4 max-w-sm space-y-3"
            >
              <label className="block space-y-1.5">
                <span className={labelled}>Your password</span>
                <input name="password" type="password" required className={input} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="action"
                  value="recovery"
                  disabled={busy}
                  className="btn"
                >
                  New recovery codes
                </button>
                <button type="submit" name="action" value="off" disabled={busy} className="btn">
                  Turn two-step off
                </button>
              </div>
            </form>
          </>
        ) : enrolling ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
            <img
              src="/api/admin/me/2fa/qr.png"
              alt="Scan this with your authenticator app"
              className="size-44 rounded-xl border border-line bg-paper p-2"
            />
            <div>
              <p className="text-sm">
                Scan it with Google Authenticator, Microsoft Authenticator, 1Password — any of
                them. If the camera will not play along, type this key in by hand:
              </p>
              <p className="mt-2 break-all rounded-lg bg-wash px-3 py-2 font-mono text-sm">
                {enrolling.secret}
              </p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const done = await twoStepCall("/confirm", new FormData(event.currentTarget));
                  if (!done) return;
                  setEnrolling(null);
                  setCodes(done.recovery_codes as string[]);
                  loadTwoStep();
                }}
                className="mt-4 flex flex-wrap items-end gap-2"
              >
                <label className="block space-y-1.5">
                  <span className={labelled}>The six digits it shows</span>
                  <input
                    name="code"
                    required
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className={`${input} w-40 text-center font-mono tracking-[0.3em]`}
                  />
                </label>
                <button type="submit" disabled={busy} className={button}>
                  Turn it on
                </button>
                <button type="button" onClick={() => setEnrolling(null)} className="btn">
                  Cancel
                </button>
              </form>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const started = await twoStepCall("/start");
              if (started) setEnrolling({ secret: String(started.secret) });
            }}
            className={`mt-4 ${button}`}
          >
            Set up two-step verification
          </button>
        )}
      </section>
    </>
  );
}
