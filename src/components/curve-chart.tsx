"use client";

import { useId, useState } from "react";
import { formatLKR, formatWear } from "@/lib/format";

/**
 * Price-per-wear-day curve. Points come from the pricing engine as Decimal strings;
 * converting them to numbers here is only for pixel positions, never for prices shown.
 */
export function CurveChart({
  points,
  currentWear,
  height = 220,
}: {
  points: { wear: string; price: string }[];
  /** Marks where the shoe is today */
  currentWear?: string;
  height?: number;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const W = 640;
  const H = height;
  const pad = { top: 16, right: 16, bottom: 36, left: 56 };
  const xs = points.map((p) => Number(p.wear));
  const ys = points.map((p) => Number(p.price));
  const xMax = xs[xs.length - 1];
  const yTicks = niceTicks(Math.max(...ys));
  const yMax = yTicks[yTicks.length - 1];
  const x = (v: number) => pad.left + (v / xMax) * (W - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - v / yMax) * (H - pad.top - pad.bottom);
  const path = points
    .map((_, i) => `${i ? "L" : "M"}${x(xs[i]).toFixed(1)},${y(ys[i]).toFixed(1)}`)
    .join("");
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * xMax));

  // Today's marker: nearest sampled point to the current wear.
  const todayIdx =
    currentWear === undefined ? null : nearestIndex(xs, Math.min(Number(currentWear), xMax));

  function onPointer(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const wear = ((svgX - pad.left) / (W - pad.left - pad.right)) * xMax;
    setActive(nearestIndex(xs, Math.max(0, Math.min(xMax, wear))));
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    setActive((i) => Math.max(0, Math.min(points.length - 1, (i ?? todayIdx ?? 0) + step)));
  }

  const shown = active ?? null;

  return (
    <figure className="w-full">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          role="img"
          aria-labelledby={`${id}-desc`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <desc id={`${id}-desc`}>
            Price per day falls from {formatLKR(points[0].price)} when new to{" "}
            {formatLKR(points[points.length - 1].price)} at{" "}
            {formatWear(points[points.length - 1].wear)} days. Use the left and right arrow keys to
            read values.
          </desc>
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-subtle text-[11px]"
              >
                {t.toLocaleString("en")}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={H - pad.bottom + 18}
              textAnchor="middle"
              className="fill-subtle text-[11px]"
            >
              {t}
            </text>
          ))}
          <text
            x={(pad.left + W - pad.right) / 2}
            y={H - 4}
            textAnchor="middle"
            className="fill-subtle text-[11px]"
          >
            Wear (days)
          </text>
          <text
            transform={`translate(12 ${(pad.top + H - pad.bottom) / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fill-subtle text-[11px]"
          >
            LKR per day
          </text>

          <path
            d={path}
            fill="none"
            className="stroke-chart"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {todayIdx !== null && (
            <g>
              <circle
                cx={x(xs[todayIdx])}
                cy={y(ys[todayIdx])}
                r={5}
                className="fill-chart stroke-paper"
                strokeWidth={2}
              />
              <text
                x={x(xs[todayIdx]) + 8}
                y={y(ys[todayIdx]) - 8}
                className="fill-ink text-[11px] font-medium"
              >
                Today
              </text>
            </g>
          )}

          {shown !== null && (
            <g pointerEvents="none">
              <line
                x1={x(xs[shown])}
                x2={x(xs[shown])}
                y1={pad.top}
                y2={H - pad.bottom}
                className="stroke-subtle"
                strokeWidth={1}
              />
              <circle
                cx={x(xs[shown])}
                cy={y(ys[shown])}
                r={4}
                className="fill-chart stroke-paper"
                strokeWidth={2}
              />
            </g>
          )}

          <rect
            x={pad.left}
            y={pad.top}
            width={W - pad.left - pad.right}
            height={H - pad.top - pad.bottom}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {shown !== null && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-line bg-paper px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(x(xs[shown]) / W) * 100}%`,
              transform: `translateX(${x(xs[shown]) > W / 2 ? "-105%" : "5%"})`,
            }}
            aria-live="polite"
          >
            <div className="font-medium">{formatLKR(points[shown].price)} per day</div>
            <div className="text-subtle">at {formatWear(points[shown].wear)} days</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-subtle">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full max-w-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Days worn</th>
              <th className="py-1 font-medium">LKR per day</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((_, i) => i % 6 === 0 || i === points.length - 1)
              .map((p) => (
                <tr key={p.wear} className="border-t border-line">
                  <td className="py-1">{formatWear(p.wear)}</td>
                  <td className="py-1">{formatLKR(p.price)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function nearestIndex(xs: number[], target: number) {
  let best = 0;
  for (let i = 1; i < xs.length; i++)
    if (Math.abs(xs[i] - target) < Math.abs(xs[best] - target)) best = i;
  return best;
}

/** Clean axis ticks from 0 to just above max (e.g. 0, 10, 20, 30). */
function niceTicks(max: number): number[] {
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(Math.round(t * 100) / 100);
  if (ticks[ticks.length - 1] < max)
    ticks.push(Math.round((ticks[ticks.length - 1] + step) * 100) / 100);
  return ticks;
}
