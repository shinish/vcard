"use client";

import { useEffect, useState } from "react";

import CreatedPanel from "../../components/CreatedPanel";
import { type AdminUser, type Company, api, apiJson } from "../../lib/api";

type UserRow = AdminUser;

type Made = { email: string; name: string; password: string };

function strongPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(16)))
    .map((n) => alphabet[n % alphabet.length])
    .join("");
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const [password, setPassword] = useState("");
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [me, setMe] = useState<string | null>(null);

  function load() {
    apiJson<UserRow[]>("/api/admin/users").then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    apiJson<Company[]>("/api/admin/companies").then(setCompanies).catch(() => {});
    apiJson<{ email: string }>("/api/admin/me").then((m) => setMe(m.email)).catch(() => {});
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const res = await api("/api/admin/users", { method: "POST", body: data });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not create the user (${res.status}).`);
      }
      setMade({
        email: String(data.get("email")),
        name: String(data.get("name") || "—"),
        password: String(data.get("password")),
      });
      form.reset();
      setPassword("");
      load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Shown once, right after creation: what was made and the link to hand over.
  if (made) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return (
      <CreatedPanel
        heading={`${made.email} can now sign in`}
        summary={[
          { term: "Email", detail: made.email },
          { term: "Name", detail: made.name },
          { term: "Access", detail: "Every company" },
          { term: "Password", detail: made.password },
        ]}
        links={[{ label: "Sign-in link", value: `${origin}/login` }]}
        primary={{ text: "Done", onClick: () => setMade(null) }}
      >
        <p className="mt-6 border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
          Send the password over a channel the person already trusts, and ask them to change
          it. This screen is the only place it is shown.
        </p>
      </CreatedPanel>
    );
  }

  return (
    <>
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Every administrator manages every company, and can reset the others&rsquo; passwords.
        </p>
      </header>

      <form onSubmit={submit} className="mb-8 max-w-xl border border-line bg-paper p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Username or email</span>
              <input
                name="email"
                type="text"
                required
                minLength={3}
                className="field"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink-soft">Name</span>
              <input
                name="name"
                className="field"
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-semibold text-ink-soft">
                Password (at least 10 characters)
              </span>
              <div className="flex gap-2">
                <input
                  name="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 border border-line px-3 py-2.5 font-mono text-sm focus:border-cyan-deep focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setPassword(strongPassword())}
                  className="shrink-0 border border-ink px-3 py-2.5 text-sm font-semibold hover:bg-ink hover:text-white"
                >
                  Generate
                </button>
              </div>
            </label>
          </div>

          {error ? (
            <p role="alert" className="mt-4 border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 btn btn-primary"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>

      {rows === null ? null : (
        <div className="surface divide-y divide-line overflow-hidden">
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className={`truncate font-display font-semibold ${row.disabled ? "line-through opacity-60" : ""}`}>{row.email}</p>
                <p className="text-sm text-ink-soft">
                  {row.name || "Administrator"}
                  {row.disabled ? " · disabled" : ""}
                  {row.email === me ? " · you" : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  onClick={() => {
                    setEditing(editing?.id === row.id ? null : row);
                    setResetting(null);
                    setDeleting(null);
                  }}
                  className="btn"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setResetting(resetting?.id === row.id ? null : row);
                    setEditing(null);
                    setDeleting(null);
                    setResetDone(null);
                  }}
                  className="btn"
                >
                  Reset password
                </button>
                <button
                  disabled={row.email === me}
                  title={row.email === me ? "You cannot disable your own account" : undefined}
                  onClick={async () => {
                    setError(null);
                    const body = new FormData();
                    body.set("email", row.email);
                    body.set("name", row.name ?? "");
                    body.set("disabled", row.disabled ? "0" : "1");
                    const res = await api(`/api/admin/users/${row.id}`, { method: "PATCH", body });
                    if (!res.ok) {
                      const detail = await res.json().catch(() => null);
                      setError(detail?.detail ?? `Could not change that (${res.status}).`);
                    }
                    load();
                  }}
                  className="btn disabled:opacity-40"
                >
                  {row.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  disabled={row.email === me}
                  title={row.email === me ? "You cannot delete your own account" : undefined}
                  onClick={() => {
                    setDeleting(deleting?.id === row.id ? null : row);
                    setEditing(null);
                    setResetting(null);
                  }}
                  className="btn disabled:opacity-40"
                >
                  Delete
                </button>
              </div>

              {editing?.id === row.id ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setError(null);
                    const res = await api(`/api/admin/users/${row.id}`, {
                      method: "PATCH",
                      body: new FormData(event.currentTarget),
                    });
                    if (!res.ok) {
                      const detail = await res.json().catch(() => null);
                      setError(detail?.detail ?? `Could not save (${res.status}).`);
                      return;
                    }
                    setEditing(null);
                    load();
                  }}
                  className="w-full border-t border-line pt-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-ink-soft">Username or email</span>
                      <input
                        name="email"
                        required
                        minLength={3}
                        defaultValue={row.email}
                        className="w-full border border-line px-3 py-2.5"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-ink-soft">Name</span>
                      <input
                        name="name"
                        defaultValue={row.name ?? ""}
                        className="w-full border border-line px-3 py-2.5"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="mt-4 grad-cyan px-4 py-2 font-display text-sm font-semibold hover:opacity-90"
                  >
                    Save details
                  </button>
                </form>
              ) : null}

              {deleting?.id === row.id ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setError(null);
                    const res = await api(`/api/admin/users/${row.id}`, {
                      method: "DELETE",
                      body: new FormData(event.currentTarget),
                    });
                    if (!res.ok) {
                      const detail = await res.json().catch(() => null);
                      setError(detail?.detail ?? `Could not delete (${res.status}).`);
                      return;
                    }
                    setDeleting(null);
                    load();
                  }}
                  className="w-full border-t border-line pt-4"
                >
                  <p className="text-sm">
                    Delete <strong>{row.email}</strong>? They lose access immediately. Contacts
                    and companies are not touched.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      name="password"
                      type="password"
                      required
                      placeholder="Your own password"
                      className="min-w-0 flex-1 border border-line px-3 py-2.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="bg-ink px-4 py-2.5 font-display text-sm font-semibold text-white hover:opacity-90"
                    >
                      Delete permanently
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(null)}
                      className="border border-line px-4 py-2.5 text-sm font-semibold hover:border-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {resetting?.id === row.id ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const body = new FormData(form);
                    setError(null);
                    try {
                      const res = await api(`/api/admin/users/${row.id}/password`, {
                        method: "POST",
                        body,
                      });
                      if (!res.ok) {
                        const detail = await res.json().catch(() => null);
                        throw new Error(detail?.detail ?? `Could not reset (${res.status}).`);
                      }
                      setResetDone(String(body.get("new_password")));
                    } catch (cause) {
                      setError((cause as Error).message);
                    }
                  }}
                  className="w-full border-t border-line pt-4"
                >
                  <p className="text-sm text-ink-soft">
                    Set a new password for <strong>{row.email}</strong>. They will be signed out
                    everywhere and will need this to get back in.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      name="new_password"
                      required
                      minLength={10}
                      defaultValue={strongPassword()}
                      className="min-w-0 flex-1 border border-line px-3 py-2.5 font-mono text-sm"
                    />
                    <button
                      type="submit"
                      className="grad-cyan px-4 py-2.5 font-display text-sm font-semibold hover:opacity-90"
                    >
                      Set password
                    </button>
                  </div>
                  {resetDone ? (
                    <p aria-live="polite" className="confirm mt-3 text-sm">
                      Done. Send <strong className="font-mono">{resetDone}</strong> to{" "}
                      {row.email} over a channel they already trust.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
