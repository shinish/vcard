"use client";

import { useEffect, useRef, useState } from "react";

import ImageEditor from "./ImageEditor";

/** A picture tile that opens a cropper, then hands the edited file to the form.
 *
 *  The edited file is put back into a real <input type="file"> through a
 *  DataTransfer, so the surrounding form posts it with no extra plumbing.
 *
 *  `existing` is the picture already saved. It can be re-cropped without
 *  hunting for the original file: it is fetched back as a blob and goes
 *  through the same editor.
 */
export default function ImagePicker({
  name,
  shape = "round",
  aspect = 1,
  label,
  hint,
  existing,
  removeName,
  maxEdge = 1400,
}: {
  name: string;
  shape?: "round" | "rect";
  aspect?: number;
  label: string;
  hint?: string;
  existing?: string | null;
  removeName?: string;
  maxEdge?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function attach(file: File) {
    const bag = new DataTransfer();
    bag.items.add(file);
    if (input.current) input.current.files = bag.files;
    setPicked(file);
    setRemoving(false);
    setPreview(URL.createObjectURL(file));
  }

  function clear() {
    if (input.current) {
      input.current.value = "";
      input.current.files = new DataTransfer().files;
    }
    setPicked(null);
    setPreview(null);
  }

  /** Re-crop what is already saved: fetch it back and reuse the editor. */
  async function editSaved() {
    if (!existing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(existing, { credentials: "include" });
      if (!res.ok) throw new Error(`Could not load the saved picture (${res.status}).`);
      const blob = await res.blob();
      const ext = blob.type === "image/png" ? "png" : "jpg";
      setEditing(new File([blob], `${name}.${ext}`, { type: blob.type || "image/png" }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? (removing ? null : (existing ?? null));
  const round = shape === "round";
  const kb = picked ? Math.max(1, Math.round(picked.size / 1024)) : null;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-ink-soft">{label}</span>

      <div className="flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file?.type.startsWith("image/")) setEditing(file);
          }}
          aria-label={shown ? `Replace ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
          className={`flex size-32 shrink-0 flex-col items-center justify-center gap-1.5 border border-dashed bg-wash p-2 ${
            dragging ? "border-brand bg-shell" : "border-line hover:border-brand"
          }`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob or API url
            <img
              src={shown}
              alt=""
              className={`max-h-full max-w-full object-contain ${
                round ? "size-24 rounded-full object-cover" : ""
              }`}
            />
          ) : (
            <>
              <span className="grad-brand flex size-9 items-center justify-center font-display text-xl leading-none">
                +
              </span>
              <span className="font-display text-xs font-semibold">Add</span>
              <span className="text-[11px] text-ink-soft">or drop it here</span>
            </>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-ink-soft">
            JPG, PNG or WebP · up to 12 MB · cropped and shrunk here before it is sent
          </p>
          {hint ? <p className="text-xs text-ink-soft">{hint}</p> : null}
          <p className="text-xs font-semibold">
            {picked
              ? `Ready to upload — ${picked.type.replace("image/", "").toUpperCase()}, ${kb} KB`
              : removing
                ? "Will be removed when you save."
                : existing
                  ? "Saved. Crop it again or replace it."
                  : "Nothing chosen yet."}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="btn"
            >
              {shown ? "Choose another" : "Choose a file"}
            </button>
            {picked ? (
              <button
                type="button"
                onClick={() => setEditing(picked)}
                className="btn"
              >
                Crop again
              </button>
            ) : existing && !removing ? (
              <button
                type="button"
                onClick={editSaved}
                disabled={busy}
                className="btn disabled:opacity-60"
              >
                {busy ? "Opening…" : "Crop the saved one"}
              </button>
            ) : null}
            {picked ? (
              <button
                type="button"
                onClick={clear}
                className="px-2 py-1.5 text-sm font-semibold text-ink-soft underline hover:text-ink"
              >
                Undo
              </button>
            ) : null}
            {removeName && existing ? (
              removing ? (
                <button
                  type="button"
                  onClick={() => setRemoving(false)}
                  className="px-2 py-1.5 text-sm font-semibold text-ink-soft underline hover:text-ink"
                >
                  Keep it
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    setRemoving(true);
                  }}
                  className="px-2 py-1.5 text-sm font-semibold text-ink-soft underline hover:text-ink"
                >
                  Remove
                </button>
              )
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border-l-2 border-brand bg-paper px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={input}
        name={name}
        type="file"
        accept="image/*"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setEditing(file);
        }}
        className="sr-only"
      />
      {removing && removeName ? <input type="hidden" name={removeName} value="1" /> : null}

      {editing ? (
        <Modal
          title={`Edit ${label.toLowerCase()}`}
          onClose={() => {
            setEditing(null);
            if (!picked) clear();
          }}
        >
          <ImageEditor
            file={editing}
            shape={shape}
            aspect={aspect}
            maxEdge={maxEdge}
            onDone={(edited) => {
              attach(edited);
              setEditing(null);
            }}
            onCancel={() => {
              setEditing(null);
              if (!picked) clear();
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}

/** A native <dialog>, so Escape and the focus trap come from the browser. */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[92vh] w-[min(72rem,94vw)] overflow-auto border border-line bg-paper p-0 backdrop:bg-ink/70"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-display text-base font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="px-2 text-lg leading-none text-ink-soft hover:text-ink"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
