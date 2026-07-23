import Grainient from "./Grainient/Grainient";
import { useStore } from "../store";

/** Full-viewport animated gradient rendered behind the whole app. The workspace
 *  shell is semi-transparent, so this shines through the sidebar + padding frame
 *  while the opaque main card covers it. Enable/disable and colours come from the
 *  Appearance preferences (Settings). */
export function Background() {
  const { backgroundEnabled, palette } = useStore();
  if (!backgroundEnabled) return null;

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <Grainient
        color1={palette.gradient[0]}
        color2={palette.gradient[1]}
        color3={palette.gradient[2]}
        timeSpeed={0.25}
        colorBalance={0}
        warpStrength={1}
        warpFrequency={5}
        warpSpeed={2}
        warpAmplitude={50}
        blendAngle={0}
        blendSoftness={0.05}
        rotationAmount={500}
        noiseScale={2}
        grainAmount={0.1}
        grainScale={2}
        grainAnimated={false}
        contrast={1.5}
        gamma={1}
        saturation={1}
        centerX={0}
        centerY={0}
        zoom={0.9}
      />
    </div>
  );
}
