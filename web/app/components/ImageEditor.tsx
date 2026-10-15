"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

type Shape = "round" | "rect";

/** Brightness, contrast and saturation as one canvas/CSS filter string.
 *
 *  Both the live crop and the written file read this, so what is on screen is
 *  what gets uploaded. Sliders are percentages around 0.
 */
function filterOf(a: { bright: number; contrast: number; saturate: number }) {
  // Sharpness is not a CSS filter; it is applied to the pixels on render.
  return `brightness(${1 + a.bright / 100}) contrast(${1 + a.contrast / 100}) saturate(${
    1 + a.saturate / 100
  })`;
}

/** Sharpen in place with a 3x3 unsharp kernel.
 *
 *  Canvas filters cover brightness, contrast and saturation but have no
 *  sharpen, so this is the one effect that has to touch pixels. `amount` is
 *  0..1; the centre weight grows with it and the ring takes the difference.
 */
function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  if (amount <= 0 || w < 3 || h < 3) return;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const centre = 1 + 4 * amount;
  const side = -amount;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out.data.set(src.data.subarray(at, at + 4), at);
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const value =
          src.data[at + c] * centre +
          side *
            (src.data[at - 4 + c] +
              src.data[at + 4 + c] +
              src.data[at - w * 4 + c] +
              src.data[at + w * 4 + c]);
        out.data[at + c] = value < 0 ? 0 : value > 255 ? 255 : value;
      }
      out.data[at + 3] = src.data[at + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** Draw the chosen crop at the chosen rotation onto a canvas and return a file.
 *
 *  `maxEdge` caps the result: a modern phone photo cropped at full resolution
 *  is several megabytes for no visible gain on a card, and the upload has to
 *  cross a phone network.
 */
async function render(
  src: string,
  crop: Area,
  rotation: number,
  type: string,
  name: string,
  maxEdge: number,
  filter: string,
  background: string | null,
  crispness = 0,
): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  // Rotate on a canvas big enough to hold the turned image, then cut the crop
  // out of it, so a rotated crop does not clip its own corners.
  const radians = (rotation * Math.PI) / 180;
  const box = Math.ceil(
    Math.abs(image.width * Math.cos(radians)) + Math.abs(image.height * Math.sin(radians)),
  );
  const boxH = Math.ceil(
    Math.abs(image.width * Math.sin(radians)) + Math.abs(image.height * Math.cos(radians)),
  );

  const spin = document.createElement("canvas");
  spin.width = box;
  spin.height = boxH;
  const spinCtx = spin.getContext("2d")!;
  spinCtx.translate(box / 2, boxH / 2);
  spinCtx.rotate(radians);
  spinCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const shrink = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(crop.width * shrink));
  out.height = Math.max(1, Math.round(crop.height * shrink));
  const ctx = out.getContext("2d")!;
  // JPEG has no alpha; without a fill a transparent source turns black.
  const fill = background ?? (type === "image/png" || type === "image/webp" ? null : "#ffffff");
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.filter = filter;
  ctx.drawImage(
    spin,
    Math.round(crop.x),
    Math.round(crop.y),
    Math.round(crop.width),
    Math.round(crop.height),
    0,
    0,
    out.width,
    out.height,
  );

  sharpen(ctx, out.width, out.height, crispness / 100);

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob(resolve, type, type === "image/png" ? undefined : 0.9),
  );
  if (!blob) throw new Error("The browser could not produce the image.");
  return new File([blob], name, { type });
}

const FORMATS = [
  { type: "image/png", ext: "png", label: "PNG — keeps transparency" },
  { type: "image/jpeg", ext: "jpg", label: "JPEG — smallest for photos" },
  { type: "image/webp", ext: "webp", label: "WebP — small, keeps transparency" },
];

const ADJUSTMENTS = [
  { key: "bright", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturate", label: "Saturation" },
  { key: "sharp", label: "Sharpness" },
] as const;

type Adjust = { bright: number; contrast: number; saturate: number; sharp: number };
const NEUTRAL: Adjust = { bright: 0, contrast: 0, saturate: 0, sharp: 0 };

/** One undoable state of the editor. */
type Snap = {
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  ratio: number | null;
  adjust: Adjust;
  background: string | null;
};

/** Crop, straighten and tune a picture before it is uploaded.
 *
 *  Logos keep their transparency (PNG) and can be cut to their own shape — a
 *  wide wordmark squeezed into a square arrives on the card as a sliver with
 *  empty space around it. Photos are squared, which is what the card and the
 *  vCard want.
 */
export default function ImageEditor({
  file,
  shape = "round",
  aspect = 1,
  maxEdge = 1400,
  onDone,
  onCancel,
}: {
  file: File;
  shape?: Shape;
  aspect?: number;
  maxEdge?: number;
  onDone: (edited: File) => void;
  onCancel: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<number | null>(null);
  const [ratio, setRatio] = useState<number | null>(aspect);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [adjust, setAdjust] = useState<Adjust>(NEUTRAL);
  const [format, setFormat] = useState(file.type === "image/png" ? "image/png" : "image/jpeg");
  const [background, setBackground] = useState<string | null>(null);
  const [custom, setCustom] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  // Undo history. A ref, because pushing to it must not itself re-run the
  // effect that pushes; the counter is only there to redraw the buttons.
  const past = useRef<{ snaps: Snap[]; at: number }>({ snaps: [], at: -1 });
  const replaying = useRef(false);
  const [, redraw] = useState(0);

  useEffect(() => {
    const made = URL.createObjectURL(file);
    setSrc(made);
    const probe = new Image();
    probe.onload = () => setNatural(probe.naturalWidth / probe.naturalHeight);
    probe.src = made;
    return () => URL.revokeObjectURL(made);
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const filter = filterOf(adjust);
  const round = shape === "round";

  // Snapshot once the controls have settled, so a slider drag is one undo
  // step rather than forty.
  useEffect(() => {
    if (replaying.current) {
      replaying.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const bag = past.current;
      bag.snaps = [...bag.snaps.slice(0, bag.at + 1), { crop, zoom, rotation, ratio, adjust, background }];
      bag.at = bag.snaps.length - 1;
      redraw((n) => n + 1);
    }, 400);
    return () => clearTimeout(timer);
  }, [crop, zoom, rotation, ratio, adjust, background]);

  function step(by: number) {
    const bag = past.current;
    const snap = bag.snaps[bag.at + by];
    if (!snap) return;
    replaying.current = true;
    bag.at += by;
    setCrop(snap.crop);
    setZoom(snap.zoom);
    setRotation(snap.rotation);
    setRatio(snap.ratio);
    setAdjust(snap.adjust);
    setBackground(snap.background);
    redraw((n) => n + 1);
  }

  // The preview is the real output, rendered small: one code path decides what
  // the file looks like. Waiting out a slider drag keeps it off every tick.
  useEffect(() => {
    if (!src || !area) return;
    const timer = setTimeout(async () => {
      try {
        const made = await render(
          src,
          area,
          rotation,
          format,
          "preview",
          320,
          filter,
          background,
          adjust.sharp,
        );
        const url = URL.createObjectURL(made);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreview(url);
      } catch {
        // a preview that cannot be drawn is not worth an error message
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [src, area, rotation, format, filter, background, adjust.sharp]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  // Only a logo gets to keep its own proportions; a contact photo is round on
  // the card and in every phone's address book.
  const ratios: { label: string; value: number | null }[] =
    shape === "rect"
      ? [
          { label: "As it is", value: null },
          { label: "Wide", value: 4 },
          { label: "3:2", value: 3 / 2 },
          { label: "Square", value: 1 },
        ]
      : [];

  const shrink = area ? Math.min(1, maxEdge / Math.max(area.width, area.height)) : 1;
  const outW = area ? Math.round(area.width * shrink) : 0;
  const outH = area ? Math.round(area.height * shrink) : 0;

  async function apply() {
    if (!src || !area) return;
    setBusy(true);
    setError(null);
    try {
      const ext = FORMATS.find((f) => f.type === format)?.ext ?? "png";
      const name = `${file.name.replace(/\.[^.]+$/, "")}.${ext}`;
      onDone(
        await render(src, area, rotation, format, name, maxEdge, filter, background, adjust.sharp),
      );
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  function reset() {
    setZoom(1);
    setRotation(0);
    setCrop({ x: 0, y: 0 });
    setRatio(aspect);
    setAdjust(NEUTRAL);
    setBackground(null);
  }

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_14rem]">
      {/* --- The picture itself ------------------------------------------- */}
      <div>
        <div
          className="relative h-80 w-full overflow-hidden rounded-xl bg-shell"
          style={{
            // a checkerboard, so transparency reads as transparency
            backgroundImage:
              "linear-gradient(45deg,#1b2a2c 25%,transparent 25%,transparent 75%,#1b2a2c 75%)," +
              "linear-gradient(45deg,#1b2a2c 25%,transparent 25%,transparent 75%,#1b2a2c 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0,9px 9px",
          }}
        >
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={ratio === null ? (natural ?? 1) : ratio}
              cropShape={round ? "round" : "rect"}
              showGrid={!round}
              restrictPosition={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              style={{ mediaStyle: { filter } }}
            />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(2))))}
            className="size-8 shrink-0 rounded-lg border border-line text-lg leading-none hover:border-ink"
          >
            −
          </button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="min-w-24 flex-1 accent-cyan-deep"
            aria-label="Zoom"
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(4, Number((z + 0.2).toFixed(2))))}
            className="size-8 shrink-0 rounded-lg border border-line text-lg leading-none hover:border-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90 > 180 ? r - 270 : r + 90))}
            className="btn px-3 py-1.5"
          >
            Rotate 90°
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={past.current.at <= 0}
            className="btn px-3 py-1.5 disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={past.current.at >= past.current.snaps.length - 1}
            className="btn px-3 py-1.5 disabled:opacity-40"
          >
            Redo
          </button>
          <button type="button" onClick={reset} className="btn px-3 py-1.5">
            Reset
          </button>
        </div>

        <label className="mt-3 block space-y-1">
          <span className="text-xs font-semibold text-ink-soft">Straighten — {rotation}°</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="w-full accent-cyan-deep"
            aria-label="Rotate"
          />
        </label>

        {ratios.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-soft">Shape</span>
            {ratios.map((r) => {
              const on = r.value === null ? ratio === null : Math.abs(ratio! - r.value) < 0.001;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setRatio(r.value)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                    on ? "grad-cyan border-cyan-deep" : "border-line hover:border-ink"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* --- Adjustments, background, format ------------------------------- */}
      <div className="space-y-5">
        <p className="chip">
          {area ? `${outW} × ${outH} px out` : "Drag to choose the crop"}
        </p>

        <fieldset className="space-y-2">
          <legend className="font-display text-sm font-bold">Adjustments</legend>
          {ADJUSTMENTS.map((a) => (
            <label key={a.key} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 text-ink-soft">{a.label}</span>
              <input
                type="range"
                min={a.key === "sharp" ? 0 : -60}
                max={60}
                step={1}
                value={adjust[a.key]}
                onChange={(e) => setAdjust({ ...adjust, [a.key]: Number(e.target.value) })}
                className="min-w-0 flex-1 accent-cyan-deep"
              />
              <span className="w-10 shrink-0 text-right font-mono text-xs">{adjust[a.key]}</span>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend className="font-display text-sm font-bold">Background</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { key: null, label: "Transparent" },
              { key: "#ffffff", label: "White" },
              { key: custom, label: "Custom" },
            ].map((b, i) => {
              const on = i === 2 ? background !== null && background !== "#ffffff" : background === b.key;
              return (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setBackground(b.key)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    on ? "grad-cyan border-cyan-deep" : "border-line hover:border-ink"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
            <input
              type="color"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setBackground(e.target.value);
              }}
              aria-label="Custom background colour"
              className="h-9 w-12 rounded-lg border border-line bg-paper p-1"
            />
          </div>
          {format === "image/jpeg" && background === null ? (
            <p className="mt-2 text-xs text-ink-soft">
              JPEG has no transparency, so this one is saved on white.
            </p>
          ) : null}
        </fieldset>

        <label className="block space-y-1.5">
          <span className="font-display text-sm font-bold">Output format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="field text-sm"
          >
            {FORMATS.map((f) => (
              <option key={f.type} value={f.type}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-ink-soft">
            The server re-encodes on save — a logo as PNG, a photo as JPEG — so this mostly
            decides what travels over the network.
          </span>
        </label>
      </div>

      {/* --- What it will look like ---------------------------------------- */}
      <div>
        <h3 className="font-display text-sm font-bold">Preview</h3>
        <p className="text-xs text-ink-soft">At the sizes the card uses.</p>

        <div className="mt-3 space-y-3">
          {[128, 64, 32].map((size) => (
            <div key={size} className="flex items-center gap-3">
              <span
                className={`flex shrink-0 items-center justify-center overflow-hidden border border-line ${
                  round ? "rounded-full" : "rounded-lg"
                }`}
                style={{
                  width: size,
                  height: round ? size : "auto",
                  minHeight: 24,
                  // the same checkerboard as the canvas, so a transparent
                  // logo reads as transparent here too
                  backgroundImage:
                    "linear-gradient(45deg,#e7eef0 25%,transparent 25%,transparent 75%,#e7eef0 75%)," +
                    "linear-gradient(45deg,#e7eef0 25%,transparent 25%,transparent 75%,#e7eef0 75%)",
                  backgroundColor: "#fff",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0,6px 6px",
                }}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a blob url
                  <img
                    src={preview}
                    alt=""
                    className={round ? "size-full object-cover" : "w-full object-contain"}
                  />
                ) : null}
              </span>
              <span className="text-xs text-ink-soft">
                {size} × {size} px
              </span>
            </div>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg border-l-2 border-cyan-deep bg-wash px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={apply}
            disabled={busy || !area}
            className="btn btn-primary"
          >
            {busy ? "Applying…" : "Use this"}
          </button>
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
