"use client";

import { useState } from "react";

import { API, type Media, api } from "../lib/api";
import ImagePicker from "./ImagePicker";
import { Icon } from "./icons";

/** The company's showcase: pictures and videos every card it owns displays.
 *
 *  Set once per company, like the rest of the look, rather than per person. */
export default function MediaManager({
  companyId,
  media,
  onChange,
}: {
  companyId: number | string;
  media: Media[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState<"image" | "video" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>, kind: "image" | "video") {
    event.preventDefault();
    const body = new FormData(event.currentTarget);
    body.set("kind", kind);
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/api/admin/companies/${companyId}/media`, { method: "POST", body });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not add it (${res.status}).`);
      }
      setAdding(null);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setError(null);
    const res = await api(`/api/admin/media/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Could not remove it (${res.status}).`);
      return;
    }
    onChange();
  }

  return (
    <section className="surface mb-7 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Showcase</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Pictures and videos of what this company does. They appear on every card here, under
            the contact details.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAdding(adding === "image" ? null : "image")}
            className="btn"
          >
            <Icon name="plus" className="size-4" />
            Picture
          </button>
          <button
            type="button"
            onClick={() => setAdding(adding === "video" ? null : "video")}
            className="btn"
          >
            <Icon name="play" className="size-4" />
            Video
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border-l-2 border-brand bg-wash px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {adding === "image" ? (
        <form onSubmit={(e) => send(e, "image")} className="mt-5 rounded-xl border border-line bg-wash p-4">
          <ImagePicker
            name="file"
            shape="rect"
            aspect={4 / 3}
            maxEdge={1280}
            label="Picture"
            hint="A product, a shopfront, a finished job. Crop it before it goes up."
          />
          <label className="mt-3 block space-y-1.5">
            <span className="text-sm font-semibold text-ink-soft">Caption</span>
            <input name="caption" placeholder="Wide-format printing" className="field" />
          </label>
          <button type="submit" disabled={busy} className="btn btn-primary mt-4">
            {busy ? "Adding…" : "Add the picture"}
          </button>
        </form>
      ) : null}

      {adding === "video" ? (
        <form onSubmit={(e) => send(e, "video")} className="mt-5 rounded-xl border border-line bg-wash p-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink-soft">Video link</span>
            <input
              name="url"
              required
              placeholder="https://www.youtube.com/watch?v=…"
              className="field"
            />
            <span className="block text-xs text-ink-soft">
              YouTube and Vimeo play on the card itself. Any other link shows as a button.
            </span>
          </label>
          <label className="mt-3 block space-y-1.5">
            <span className="text-sm font-semibold text-ink-soft">Caption</span>
            <input name="caption" placeholder="A minute inside our print room" className="field" />
          </label>
          <button type="submit" disabled={busy} className="btn btn-primary mt-4">
            {busy ? "Adding…" : "Add the video"}
          </button>
        </form>
      ) : null}

      {media.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">Nothing yet. Cards here show contact details only.</p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl border border-line">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by the API
                <img
                  src={`${API}${item.image_url}`}
                  alt={item.caption ?? ""}
                  className="h-32 w-full object-cover"
                />
              ) : (
                <p className="flex h-32 items-center justify-center gap-2 bg-wash text-sm font-semibold text-ink-soft">
                  <Icon name="play" className="size-5" />
                  Video
                </p>
              )}
              <div className="flex items-start justify-between gap-2 p-3">
                <span className="min-w-0 text-xs">
                  <span className="block font-semibold">{item.caption ?? "No caption"}</span>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-brand-ink underline"
                    >
                      {item.url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="shrink-0 text-xs font-semibold text-ink-soft underline hover:text-ink"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
