"use client";

/** Views and taps per day, as two lines on one scale.
 *
 *  Inline SVG rather than a charting dependency: two series, one axis, no
 *  zooming. Views carry the navy and a filled area; taps are the lighter blue,
 *  dashed, so the pair survives being printed or read with a colour vision
 *  deficiency. Both lines are labelled at their end, so identity is never
 *  colour alone.
 */
export default function TrendChart({
  series,
  height = 220,
}: {
  series: { day: string; views: number; clicks: number }[];
  height?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { top: 16, right: 44, bottom: 24, left: 36 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const peak = Math.max(1, ...series.flatMap((d) => [d.views, d.clicks]));
  // A round ceiling so the gridline labels are round numbers too.
  const step = Math.max(1, Math.ceil(peak / 4));
  const ceiling = step * 4;

  const x = (i: number) => pad.left + (series.length < 2 ? plotW / 2 : (i * plotW) / (series.length - 1));
  const y = (v: number) => pad.top + plotH - (v / ceiling) * plotH;
  const line = (key: "views" | "clicks") =>
    series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");

  const last = series[series.length - 1];
  const ticks = [0, Math.floor(series.length / 2), series.length - 1].filter(
    (i, n, all) => i >= 0 && all.indexOf(i) === n,
  );

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap gap-4 text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="block h-0.5 w-5" style={{ background: "#0067ff" }} />
          Views
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="block h-0.5 w-5"
            style={{ backgroundImage: "repeating-linear-gradient(90deg,#00afb9 0 4px,transparent 4px 7px)" }}
          />
          Clicks
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Views and taps per day from ${series[0]?.day ?? ""} to ${last?.day ?? ""}`}
      >
        {[0, 1, 2, 3, 4].map((n) => {
          const value = step * n;
          return (
            <g key={n}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-ink-soft text-[10px]"
              >
                {value}
              </text>
            </g>
          );
        })}

        <path
          d={`${line("views")} L${x(series.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`}
          fill="#0067ff"
          opacity={0.1}
        />
        <path d={line("views")} fill="none" stroke="#0067ff" strokeWidth={2} />
        <path
          d={line("clicks")}
          fill="none"
          stroke="#00afb9"
          strokeWidth={2}
          strokeDasharray="5 3"
        />

        {last ? (
          <>
            <text x={W - pad.right + 6} y={y(last.views) + 4} className="fill-ink text-[10px] font-semibold">
              {last.views}
            </text>
            <text
              x={W - pad.right + 6}
              y={y(last.clicks) + 4}
              className="fill-ink-soft text-[10px] font-semibold"
            >
              {last.clicks}
            </text>
          </>
        ) : null}

        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
            className="fill-ink-soft text-[10px]"
          >
            {series[i]?.day.slice(5)}
          </text>
        ))}

        {/* A hit strip per day, so hovering anywhere in the column reads out
            that day. The browser's own tooltip is the whole mechanism. */}
        {series.map((d, i) => (
          <rect
            key={d.day}
            x={x(i) - plotW / series.length / 2}
            y={pad.top}
            width={plotW / series.length}
            height={plotH}
            fill="transparent"
          >
            <title>{`${d.day}: ${d.views} views, ${d.clicks} taps`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
