import { useId } from "react";

/**
 * Impacted-users trend for the metadata pane: a filled area rising to "Now"
 * (solid) plus a dashed projection of the expected recovery after a fix. The
 * curve is generated deterministically from the id + peak value, so it's stable
 * per issue without needing real time-series data.
 */
export function ImpactChart({ seed }: { seed: number }) {
  const gradId = useId();
  const W = 320;
  const H = 96;
  const pad = 6;

  // Deterministic pseudo-random in [0,1) from an integer step.
  const rand = (n: number) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const solidN = 22; // samples up to "Now"
  const projN = 10; // dashed projection after "Now"

  // Rising curve (ease-out) with small jitter, normalised 0..1, peaking at Now.
  const rise = Array.from({ length: solidN }, (_, i) => {
    const t = i / (solidN - 1);
    const base = 1 - Math.pow(1 - t, 2.2);
    return Math.min(1, Math.max(0.04, base + (rand(i) - 0.5) * 0.06));
  });
  // Projection: eases back down toward a residual as the fix takes effect.
  const fall = Array.from({ length: projN }, (_, i) => {
    const t = (i + 1) / projN;
    return Math.max(0.08, 1 - Math.pow(t, 1.5) * 0.82);
  });

  const xs = (i: number, n: number, x0: number, x1: number) =>
    x0 + (x1 - x0) * (n === 1 ? 0 : i / (n - 1));
  const y = (v: number) => H - pad - v * (H - pad * 2);

  const nowX = pad + (W - pad * 2) * 0.62; // "Now" sits ~62% across
  const solidPts = rise.map((v, i) => [xs(i, solidN, pad, nowX), y(v)] as const);
  const projPts = fall.map((v, i) => [xs(i, projN, nowX, W - pad), y(v)] as const);

  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  const solidPath = line(solidPts);
  const projPath = "M" + nowX.toFixed(1) + " " + y(rise[rise.length - 1]).toFixed(1) + " " + line(projPts).slice(1);
  const areaPath = `${solidPath} L${nowX.toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;
  const [nx, ny] = solidPts[solidPts.length - 1];

  const ticks = ["T-2", "T-1", "Now", "Fix", "T+1"];

  return (
    <div className="flex flex-col gap-1.5">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Impacted users over time">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--tomato-9)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--tomato-9)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={solidPath} fill="none" stroke="var(--tomato-9)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <path d={projPath} fill="none" stroke="var(--tomato-9)" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" />
        {/* "Now" marker */}
        <line x1={nx} y1={pad} x2={nx} y2={H - pad} stroke="var(--color-border-default)" strokeWidth="1" />
        <circle cx={nx} cy={ny} r="3.5" fill="var(--tomato-9)" stroke="var(--color-page)" strokeWidth="1.5" />
      </svg>
      <div className="flex justify-between px-0.5 font-departure-mono text-[0.65rem] text-tertiary-foreground">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
