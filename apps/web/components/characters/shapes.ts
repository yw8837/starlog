const r2 = (n: number) => Math.round(n * 100) / 100;

/** Five-point star centred on (cx, cy); `inner` is the inner/outer radius ratio. */
export function starPath(cx: number, cy: number, r: number, inner = 0.46): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${r2(cx + radius * Math.cos(angle))} ${r2(cy + radius * Math.sin(angle))}`);
  }
  return `M${points.join("L")}Z`;
}

/** Four-point sparkle with concave sides. */
export function sparklePath(cx: number, cy: number, r: number): string {
  const k = r2(r * 0.2);
  return (
    `M${cx} ${r2(cy - r)}Q${r2(cx + k)} ${r2(cy - k)} ${r2(cx + r)} ${cy}` +
    `Q${r2(cx + k)} ${r2(cy + k)} ${cx} ${r2(cy + r)}` +
    `Q${r2(cx - k)} ${r2(cy + k)} ${r2(cx - r)} ${cy}` +
    `Q${r2(cx - k)} ${r2(cy - k)} ${cx} ${r2(cy - r)}Z`
  );
}
