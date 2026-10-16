'use client';

import { useId, useMemo, useState } from 'react';
import { Table as TableIcon, BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatCompact, formatNumber } from '@/lib/utils';

/**
 * Charts are hand-rolled SVG — no charting dependency, so a buyer's install
 * stays small and nothing phones home.
 *
 * Color rules followed here (see styles/tokens.css for the validated palette):
 *  - Categorical hues are assigned in fixed order and never cycled; a 9th
 *    series is not generated, it folds into "Other".
 *  - Color follows the entity, not its rank, so filtering series doesn't
 *    repaint the survivors.
 *  - Series color never carries meaning alone: ≥2 series always get a legend,
 *    ≤4 are also direct-labeled, and every chart offers a table view.
 *  - One y-axis, always. Two measures of different scale get two charts.
 */

export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export function seriesColor(index: number): string {
  // Fixed order, clamped — never modulo-cycled into a repeat.
  return SERIES_COLORS[Math.min(index, SERIES_COLORS.length - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat tile — a single headline number is not a chart. No plot, no tooltip.
// ─────────────────────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  delta,
  hint,
  sparkline,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  /** Percentage change vs the previous period. */
  delta?: number | null;
  hint?: string;
  sparkline?: number[];
  /** 'warning' is the reserved status color — only for a genuine
   *  needs-attention count, never as a decorative highlight. */
  tone?: 'neutral' | 'accent' | 'warning';
}) {
  const positive = (delta ?? 0) >= 0;
  const DeltaIcon = positive ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] p-4">
      <p className="label-caps">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p
            className={cn(
              'font-display text-2xl font-semibold leading-none tracking-tight tabular-nums',
              tone === 'accent' && 'text-[color:var(--color-accent-dark)] dark:text-accent',
              tone === 'warning' && 'text-warning',
            )}
          >
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
          {delta != null && (
            <p
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-xs tabular-nums',
                positive ? 'text-success' : 'text-alert',
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
              {positive ? '+' : ''}
              {delta.toFixed(1)}%
              <span className="muted">vs prev.</span>
            </p>
          )}
          {hint && !delta && <p className="mt-2 text-xs muted">{hint}</p>}
        </div>
        {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  width = 72,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared chrome: title row + table-view toggle (the accessibility relief the
// amber series' sub-3:1 contrast obliges us to ship).
// ─────────────────────────────────────────────────────────────────────────────

function ChartFrame({
  title,
  description,
  showTable,
  onToggleTable,
  legend,
  children,
  tableView,
}: {
  title: string;
  description?: string;
  showTable: boolean;
  onToggleTable: () => void;
  legend?: React.ReactNode;
  children: React.ReactNode;
  tableView: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-[color:var(--color-border)] bg-[color:var(--color-elevated)]">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleTable}
          aria-pressed={showTable}
          title={showTable ? 'Show chart' : 'Show data table'}
          className="rounded-control border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:text-[color:var(--color-fg)]"
        >
          {showTable ? (
            <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <TableIcon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {legend && !showTable && <div className="px-5 pb-2">{legend}</div>}

      <div className="px-2 pb-4">{showTable ? tableView : children}</div>
    </div>
  );
}

function Legend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5 text-xs muted">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-pill"
            style={{ background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="scrollbar-thin max-h-72 overflow-auto px-3">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[color:var(--color-elevated)]">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                className={cn(
                  'border-b border-[color:var(--color-border)] px-2 py-2 font-medium muted',
                  i === 0 ? 'text-start' : 'text-end',
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    'border-b border-[color:var(--color-border)] px-2 py-1.5 tabular-nums',
                    ci === 0 ? 'text-start' : 'text-end',
                  )}
                >
                  {typeof cell === 'number' ? formatNumber(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Line chart — change over time. Crosshair + tooltip, direct label on the last
// point of each series, one y-axis.
// ─────────────────────────────────────────────────────────────────────────────

export type LineSeries = {
  label: string;
  points: { x: string; y: number }[];
};

export function LineChart({
  title,
  description,
  series,
  height = 220,
  valueFormatter = (v: number) => formatNumber(v),
}: {
  title: string;
  description?: string;
  series: LineSeries[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const width = 640;
  const pad = { top: 12, right: 56, bottom: 26, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const allValues = series.flatMap((s) => s.points.map((p) => p.y));
  const rawMax = Math.max(...allValues, 1);
  const max = niceCeil(rawMax);
  const ticks = [0, max / 2, max];

  const xAt = (i: number) => pad.left + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
  const yAt = (v: number) => pad.top + plotH - (v / max) * plotH;

  const hasData = allValues.some((v) => v > 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      legend={series.length >= 2 ? <Legend series={series.map((s, i) => ({ label: s.label, color: seriesColor(i) }))} /> : undefined}
      tableView={
        <DataTable
          columns={['Date', ...series.map((s) => s.label)]}
          rows={labels.map((label, i) => [
            label,
            ...series.map((s) => s.points[i]?.y ?? 0),
          ])}
        />
      }
    >
      {!hasData ? (
        <p className="px-3 py-12 text-center text-xs muted">No data for this period yet.</p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ height }}
            role="img"
            aria-label={`${title}. ${series.map((s) => `${s.label}: ${valueFormatter(s.points.at(-1)?.y ?? 0)} latest`).join('. ')}`}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
              </clipPath>
            </defs>

            {/* Recessive grid + y ticks */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={pad.left + plotW}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={pad.left - 8}
                  y={yAt(t) + 3}
                  textAnchor="end"
                  className="fill-[color:var(--color-fg-muted)] text-[10px] tabular-nums"
                >
                  {formatCompact(t)}
                </text>
              </g>
            ))}

            {/* x labels — first, middle, last only, so they never collide */}
            {[0, Math.floor(labels.length / 2), labels.length - 1]
              .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
              .map((i) => (
                <text
                  key={i}
                  x={xAt(i)}
                  y={height - 8}
                  textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
                  className="fill-[color:var(--color-fg-muted)] text-[10px]"
                >
                  {shortDate(labels[i])}
                </text>
              ))}

            {/* Crosshair */}
            {hover != null && (
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--chart-axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            )}

            <g clipPath={`url(#${clipId})`}>
              {series.map((s, si) => (
                <polyline
                  key={s.label}
                  points={s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(' ')}
                  fill="none"
                  stroke={seriesColor(si)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </g>

            {/* Hovered markers — ≥8px, with a 2px surface ring so overlapping
                series stay separable. */}
            {hover != null &&
              series.map((s, si) => {
                const point = s.points[hover];
                if (!point) return null;
                return (
                  <circle
                    key={s.label}
                    cx={xAt(hover)}
                    cy={yAt(point.y)}
                    r={4}
                    fill={seriesColor(si)}
                    stroke="var(--color-elevated)"
                    strokeWidth={2}
                  />
                );
              })}

            {/* Direct labels on the last point (≤4 series) */}
            {series.length <= 4 &&
              series.map((s, si) => {
                const last = s.points.at(-1);
                if (!last) return null;
                return (
                  <text
                    key={s.label}
                    x={pad.left + plotW + 8}
                    y={yAt(last.y) + 3}
                    className="fill-[color:var(--color-fg)] text-[10px] font-medium tabular-nums"
                  >
                    {valueFormatter(last.y)}
                  </text>
                );
              })}

            {/* Hit targets — wider than the marks */}
            {labels.map((_, i) => (
              <rect
                key={i}
                x={xAt(i) - plotW / Math.max(labels.length - 1, 1) / 2}
                y={pad.top}
                width={plotW / Math.max(labels.length - 1, 1)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            ))}
          </svg>

          {hover != null && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-control border border-[color:var(--color-border)] bg-[color:var(--color-elevated)] px-2.5 py-2 text-xs shadow-popover"
              style={{
                left: `${(xAt(hover) / width) * 100}%`,
                transform: xAt(hover) > width / 2 ? 'translateX(-105%)' : 'translateX(8px)',
              }}
            >
              <p className="mb-1 font-medium">{shortDate(labels[hover], true)}</p>
              {series.map((s, si) => (
                <p key={s.label} className="flex items-center gap-1.5 whitespace-nowrap muted">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-pill"
                    style={{ background: seriesColor(si) }}
                  />
                  {s.label}
                  <span className="ms-auto ps-3 font-medium tabular-nums text-[color:var(--color-fg)]">
                    {valueFormatter(s.points[hover]?.y ?? 0)}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </ChartFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal bar chart — magnitude comparison across a handful of categories.
// 4px rounded data-ends anchored to the baseline; 2px gap between bars.
// ─────────────────────────────────────────────────────────────────────────────

export function BarChart({
  title,
  description,
  data,
  valueLabel = 'Value',
  valueFormatter = (v: number) => formatNumber(v),
  colorBy = 'single',
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
  valueLabel?: string;
  valueFormatter?: (value: number) => string;
  /** 'single' keeps one hue for a pure magnitude read; 'category' gives each
   *  row its own identity color (only when rows *are* distinct entities). */
  colorBy?: 'single' | 'category';
}) {
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(() => niceCeil(Math.max(...data.map((d) => d.value), 1)), [data]);
  const hasData = data.some((d) => d.value > 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      tableView={<DataTable columns={['Label', valueLabel]} rows={data.map((d) => [d.label, d.value])} />}
    >
      {!hasData ? (
        <p className="px-3 py-12 text-center text-xs muted">Nothing to show yet.</p>
      ) : (
        <ul className="space-y-2 px-3 pt-1">
          {data.map((d, i) => (
            <li
              key={d.label}
              className="group relative"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate">{d.label}</span>
                <span className="shrink-0 font-medium tabular-nums">{valueFormatter(d.value)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-pill bg-[color:var(--color-border)]">
                <div
                  className="h-full rounded-pill transition-[width] duration-200 ease-out"
                  style={{
                    width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%`,
                    background: colorBy === 'category' ? seriesColor(i) : 'var(--chart-1)',
                    opacity: hover == null || hover === i ? 1 : 0.55,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel — stage-to-stage conversion. Reads as magnitude, so one hue.
// ─────────────────────────────────────────────────────────────────────────────

export function FunnelChart({
  title,
  description,
  stages,
}: {
  title: string;
  description?: string;
  stages: { label: string; value: number }[];
}) {
  const [showTable, setShowTable] = useState(false);
  const top = stages[0]?.value || 1;

  return (
    <ChartFrame
      title={title}
      description={description}
      showTable={showTable}
      onToggleTable={() => setShowTable((v) => !v)}
      tableView={
        <DataTable
          columns={['Stage', 'Count', '% of top']}
          rows={stages.map((s) => [
            s.label,
            s.value,
            `${((s.value / top) * 100).toFixed(0)}%`,
          ])}
        />
      }
    >
      <ul className="space-y-2 px-3 pt-1">
        {stages.map((stage, i) => {
          const pct = (stage.value / top) * 100;
          const prev = i > 0 ? stages[i - 1].value : null;
          const stepRate = prev && prev > 0 ? (stage.value / prev) * 100 : null;

          return (
            <li key={stage.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span>{stage.label}</span>
                <span className="flex items-baseline gap-2">
                  {stepRate != null && (
                    <span className="muted tabular-nums">{stepRate.toFixed(0)}%</span>
                  )}
                  <span className="font-medium tabular-nums">{formatNumber(stage.value)}</span>
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-control bg-[color:var(--color-border)]">
                <div
                  className="h-full rounded-control"
                  style={{
                    width: `${Math.max(pct, stage.value > 0 ? 2 : 0)}%`,
                    // Sequential ramp: one hue, light → dark down the funnel.
                    background: `var(--chart-seq-${Math.min(i + 2, 5)})`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function niceCeil(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function shortDate(iso: string | undefined, long = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(long ? { weekday: 'short' } : {}),
  });
}
