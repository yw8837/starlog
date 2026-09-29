import type { CSSProperties } from "react";
import styles from "./NightSky.module.css";

type NightSkyProps = {
  /** Multiplier on the base star count (~40). */
  density?: number;
  /** Draw the dashed constellation with twinkling gold nodes. */
  constellation?: boolean;
  /** Where the violet aurora sits. */
  glow?: "top" | "center";
  /** Seed for star placement; same seed gives the same sky on server and client. */
  seed?: number;
};

const BASE_STARS = 40;
const MAX_STARS = 200;

// Fixed shape in viewBox-style percentages (x, y).
const CONSTELLATION: ReadonlyArray<readonly [number, number]> = [
  [14, 15],
  [27, 22],
  [39, 17],
  [52, 27],
  [64, 21],
  [77, 32],
];

const TINTS = ["#ffffff", "#ffffff", "#ffffff", "#cfc6ff", "#f3dca1"] as const;

/** mulberry32: small deterministic PRNG. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n: number, digits = 2) => Number(n.toFixed(digits));

type Star = {
  left: number;
  top: number;
  size: number;
  opacity: number;
  color: string;
  delay: number;
  duration: number;
  twinkle: boolean;
};

export function makeStars(count: number, seed: number): Star[] {
  const random = makeRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const size = random() < 0.8 ? 2 : 3;
    return {
      left: round(random() * 100),
      top: round(random() * 100),
      size,
      opacity: round(0.35 + random() * 0.55),
      color: TINTS[Math.floor(random() * TINTS.length)] ?? "#ffffff",
      delay: round(random() * 6),
      duration: round(2.6 + random() * 3.4),
      twinkle: i % 3 === 0,
    };
  });
}

export function NightSky({ density = 1, constellation = false, glow = "top", seed = 7 }: NightSkyProps) {
  const count = Math.min(MAX_STARS, Math.max(0, Math.round(BASE_STARS * density)));
  const stars = makeStars(count, seed);

  return (
    <div className={styles.sky} data-glow={glow} aria-hidden="true">
      <div className={styles.moon} />
      <div className={styles.moonCore} />

      {stars.map((star, i) => (
        <span
          key={i}
          className={star.twinkle ? `${styles.star} ${styles.twinkle}` : styles.star}
          style={
            {
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              background: star.color,
              boxShadow: star.size > 2.1 ? `0 0 6px ${star.color}` : undefined,
              "--o": star.opacity,
              "--delay": `${star.delay}s`,
              "--dur": `${star.duration}s`,
            } as CSSProperties
          }
        />
      ))}

      {constellation && (
        <>
          <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
            <polyline points={CONSTELLATION.map(([x, y]) => `${x},${y}`).join(" ")} />
          </svg>
          {CONSTELLATION.map(([x, y], i) => (
            <span
              key={i}
              className={styles.node}
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  "--delay": `${round(i * 0.7)}s`,
                } as CSSProperties
              }
            />
          ))}
        </>
      )}
    </div>
  );
}
