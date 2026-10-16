"use client";

/** Paired daily counts and trend lines share the same scale. */
export default function TrendChart({ series, height = 240, secondaryLabel = "Clicks", showLegend = true }: {
  series: { day: string; views: number; clicks: number }[];
  height?: number;
  secondaryLabel?: string;
  showLegend?: boolean;
}) {
  const W = 640, H = height;
  const pad = { top: 18, right: 14, bottom: 30, left: 38 };
  const plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
  const step = Math.max(1, Math.ceil(Math.max(1, ...series.flatMap(d => [d.views, d.clicks])) / 4));
  const slot = plotW / Math.max(1, series.length), bar = Math.min(18, slot * .32);
  const x = (i: number) => pad.left + slot * (i + .5);
  const y = (n: number) => pad.top + plotH - n / (step * 4) * plotH;
  const line = (key: "views" | "clicks") => series.map((d, i) => `${i ? "L" : "M"}${x(i)} ${y(d[key])}`).join(" ");
  return <figure className="activity-chart m-0">
    {showLegend ? <figcaption className="mb-4 flex flex-wrap gap-4 text-xs text-ink-soft">
      <span><i style={{ background: "#729bd5" }} />Views</span><span><i style={{ background: "#c1d8f2" }} />{secondaryLabel}</span><span><i className="chart-line-key" />Daily trend</span>
    </figcaption> : null}
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Daily views and ${secondaryLabel.toLowerCase()}`}>
      {[0,1,2,3,4].map(n => <g key={n}>
        <line x1={pad.left} x2={W-pad.right} y1={y(n*step)} y2={y(n*step)} stroke="var(--color-line)" strokeDasharray="3 5" strokeWidth=".75" />
        <text x={pad.left-9} y={y(n*step)+3} textAnchor="end" className="fill-ink-soft text-[9px]">{n*step}</text>
      </g>)}
      {series.map((d,i) => <g key={d.day}>
        <rect x={x(i)-bar-1} y={y(d.views)} width={bar} height={Math.max(0,y(0)-y(d.views))} rx="2" fill="#729bd5" />
        <rect x={x(i)+1} y={y(d.clicks)} width={bar} height={Math.max(0,y(0)-y(d.clicks))} rx="2" fill="#c1d8f2" />
        {i % Math.max(1,Math.ceil(series.length/7)) === 0 || i === series.length-1 ? <text x={x(i)} y={H-10} textAnchor="middle" className="fill-ink-soft text-[9px]">{d.day.slice(5)}</text> : null}
      </g>)}
      <path d={line("views")} fill="none" stroke="#375e8c" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={line("clicks")} fill="none" stroke="#85a9cf" strokeWidth="1.3" strokeDasharray="4 3" strokeLinejoin="round" />
      {series.map((d,i) => <g key={d.day}>
        <circle cx={x(i)} cy={y(d.views)} r="2.4" fill="#375e8c" stroke="var(--color-paper)" strokeWidth="1" />
        <rect x={pad.left+slot*i} y={pad.top} width={slot} height={plotH} fill="transparent"><title>{`${d.day}: ${d.views} views, ${d.clicks} ${secondaryLabel.toLowerCase()}`}</title></rect>
      </g>)}
    </svg>
    {!series.length ? <p className="text-sm text-ink-soft">No activity in this period.</p> : null}
  </figure>;
}
