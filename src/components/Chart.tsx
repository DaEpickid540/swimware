/**
 * Minimal, dependency-free SVG charts (keeps the bundle lean). Accessible:
 * each chart has a role="img" + descriptive aria-label summarizing the data.
 */

export interface Point {
  label: string;
  value: number;
}

/** Line chart — good for time progression (values plotted in order). */
export function LineChart({
  data,
  ariaLabel,
  lowerIsBetter = false,
  height = 160,
  width = 480,
}: {
  data: Point[];
  ariaLabel: string;
  lowerIsBetter?: boolean;
  height?: number;
  width?: number;
}) {
  if (data.length === 0) return null;
  const pad = 28;
  const w = width;
  const h = height;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / Math.max(1, data.length - 1);

  const x = (i: number) => pad + i * stepX;
  const y = (v: number) => {
    const t = (v - min) / range; // 0..1
    // For "lower is better" (swim times) we invert so improvement trends up.
    const norm = lowerIsBetter ? t : 1 - t;
    return pad + norm * (h - pad * 2);
  };

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ");

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <line className="chart__axis" x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
      <line className="chart__axis" x1={pad} y1={pad} x2={pad} y2={h - pad} />
      <path className="chart__line" d={path} />
      {data.map((d, i) => (
        <g key={i}>
          <circle className="chart__dot" cx={x(i)} cy={y(d.value)} r={3.5} />
          {(i === 0 || i === data.length - 1) && (
            <text className="chart__label" x={x(i)} y={h - pad + 14} textAnchor="middle">
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Bar chart — good for counts (attendance, RSVPs). */
export function BarChart({
  data,
  ariaLabel,
  height = 160,
  width = 480,
}: {
  data: Point[];
  ariaLabel: string;
  height?: number;
  width?: number;
}) {
  if (data.length === 0) return null;
  const pad = 28;
  const w = width;
  const h = height;
  const max = Math.max(...data.map((d) => d.value), 1);
  const gap = 10;
  const barW = (w - pad * 2 - gap * (data.length - 1)) / data.length;

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={ariaLabel}>
      <line className="chart__axis" x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
      {data.map((d, i) => {
        const barH = (d.value / max) * (h - pad * 2);
        const bx = pad + i * (barW + gap);
        return (
          <g key={i}>
            <rect className="chart__bar" x={bx} y={h - pad - barH} width={barW} height={barH} rx={3} />
            <text className="chart__label" x={bx + barW / 2} y={h - pad + 14} textAnchor="middle">
              {d.label}
            </text>
            <text className="chart__label" x={bx + barW / 2} y={h - pad - barH - 4} textAnchor="middle">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
