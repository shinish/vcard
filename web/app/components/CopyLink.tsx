"use client";

import { useEffect, useRef, useState } from "react";

type State = "idle" | "copied" | "manual";

/** A read-only link with a copy button.
 *
 *  navigator.clipboard only exists in a secure context, so over plain HTTP on
 *  a LAN address it is simply missing. The execCommand path still works there,
 *  and if both fail the text is selected and the user is told to press copy.
 */
export default function CopyLink({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<State>("idle");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 4000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setState("copied");
        return;
      }
    } catch {
      // fall through to the selection-based path
    }
    const el = input.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, el.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    setState(ok ? "copied" : "manual");
  }

  return (
    <div className="space-y-1.5">
      {label ? <p className="text-sm font-semibold text-ink-soft">{label}</p> : null}
      <div className="flex gap-2">
        <input
          ref={input}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 border border-line bg-wash px-3 py-2.5 font-mono text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 bg-ink px-4 py-2.5 font-display text-sm font-semibold text-white hover:bg-cyan-deep hover:text-ink"
        >
          {state === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-ink-soft">
        {state === "copied" ? (
          <span className="confirm">Link copied to the clipboard.</span>
        ) : state === "manual" ? (
          <span className="confirm">Selected — press Cmd+C or Ctrl+C to copy.</span>
        ) : null}
      </p>
    </div>
  );
}
