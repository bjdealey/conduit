import { useId } from "react";

/**
 * Events-over-time chart for a surface: three tracking series (orange/green/blue)
 * over ~7 hours of 10-minute buckets, with a filled area under the top line. The
 * spiky curve is generated deterministically from `seed`, so it's stable per
 * surface without real telemetry.
 */
export function SurfaceChart({ seed }: { seed: number }) {
  const gradId = useId();
  const W = 1000;
  const H = 300;
  const padY = 10;

  const rand = (n: number) => {
    const x = Math.sin(seed * 41.17 + n * 91.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const N = 84; // ~7h of 10-min buckets
  // A handful of sharp peaks over a low, jittery baseline.
  const peaks = [6, 12, 18, 22, 40, 58, 70, 82];
  const base = Array.from({ length: N }, (_, i) => {
    let v = 0.08 + rand(i) * 0.06;
    for (const p of peaks) {
      const d = Math.abs(i - p);
      const amp = 0.5 + rand(p) * 0.5;
      v += amp * Math.exp(-(d * d) / (2 * (1.6 + rand(p * 2))));
    }
    return Math.min(1, v);
  });

  const series = [
    { color: "var(--orange-9)", mul: 1.0 },
    { color: "var(--grass-9)", mul: 0.9 },
    { color: "var(--blue-9)", mul: 0.8 },
  ];

  const x = (i: number) => (W * i) / (N - 1);
  const y = (v: number) => H - padY - v * (H - padY * 2);

  // Smooth-ish path via straight segments (enough points that it reads as smooth).
  const path = (mul: number) =>
    base.map((v, i) => (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(v * mul).toFixed(1)).join(" ");

  const topPath = path(series[0].mul);
  const areaPath = `${topPath} L${W} ${H - padY} L0 ${H - padY} Z`;

  const xLabels = ["7:00 PM", "8:40 PM", "10:20 PM", "11:50 PM", "1:30 AM", "Now"];

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Events over time">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue-9)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--blue-9)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        {/* Draw lowest first so the orange top line reads on top. */}
        {[...series].reverse().map((s) => (
          <path key={s.color} d={path(s.mul)} fill="none" stroke={s.color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="flex justify-between px-1 font-departure-mono text-[0.65rem] text-tertiary-foreground">
        {xLabels.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
