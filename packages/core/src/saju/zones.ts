import type { ResolvedCivilTime } from "./policy";

/**
 * Civil time for births outside Korea (P6 spec §8), from the runtime's IANA tzdata through Intl
 * (Node and Workers ship full ICU). Korea keeps its own checked table in policy.ts.
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** UTC offset (ms, LMT seconds included) in `timeZone` at `instantMs`. */
export function zoneOffsetMsAt(instantMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallMs - Math.floor(instantMs / 1000) * 1000;
}

/** Every instant a wall-clock reading (fields as UTC ms) denotes in `timeZone`, earliest first. */
export function zoneWallClockInstants(wallMs: number, timeZone: string): ResolvedCivilTime[] {
  const candidates = new Set<number>();
  for (const probe of [wallMs - DAY_MS, wallMs, wallMs + DAY_MS]) candidates.add(wallMs - zoneOffsetMsAt(probe, timeZone));
  return [...candidates]
    .filter((instantMs) => instantMs + zoneOffsetMsAt(instantMs, timeZone) === wallMs)
    .sort((a, b) => a - b)
    .map((instantMs) => {
      const offsetMinutes = zoneOffsetMsAt(instantMs, timeZone) / 60_000;
      return { instantMs, offsetMinutes, standardOffsetMinutes: standardOffsetMinutes(instantMs, timeZone) };
    });
}

/** The year's standard offset: the smaller of the January and July offsets (only the ERA_STANDARD clock uses it). */
function standardOffsetMinutes(instantMs: number, timeZone: string): number {
  const year = new Date(instantMs).getUTCFullYear();
  return Math.min(zoneOffsetMsAt(Date.UTC(year, 0, 15), timeZone), zoneOffsetMsAt(Date.UTC(year, 6, 15), timeZone)) / 60_000;
}
