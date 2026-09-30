/** The 12 zodiac constellations of 별자리 인연: slots, star layout, star lines and sun-sign dates. */

export type SignId =
  | "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo"
  | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";

export interface ConstellationDef {
  id: SignId;
  ko: string;
  en: string;
  /** friends needed to complete it (= stars.length) */
  slots: number;
  /** star positions in a 1000×1000 box, in fill order */
  stars: readonly (readonly [number, number])[];
  /** pairs of star indexes joined by a line */
  lines: readonly (readonly [number, number])[];
  /** first day of the tropical sun sign, [month, day] */
  from: readonly [number, number];
}

type Def = Omit<ConstellationDef, "slots">;

const DEFS: readonly Def[] = [
  { id: "aries", ko: "양자리", en: "Aries", from: [3, 21],
    stars: [[180, 640], [430, 520], [600, 470], [790, 300]], lines: [[0, 1], [1, 2], [2, 3]] },
  { id: "taurus", ko: "황소자리", en: "Taurus", from: [4, 20],
    stars: [[560, 620], [430, 520], [640, 500], [150, 330], [780, 220]], lines: [[0, 1], [0, 2], [1, 3], [2, 4]] },
  { id: "gemini", ko: "쌍둥이자리", en: "Gemini", from: [5, 21],
    stars: [[300, 180], [540, 200], [270, 480], [510, 500], [230, 800], [480, 820]],
    lines: [[0, 1], [0, 2], [2, 4], [1, 3], [3, 5]] },
  { id: "cancer", ko: "게자리", en: "Cancer", from: [6, 22],
    stars: [[470, 430], [520, 570], [560, 180], [260, 790], [770, 770]], lines: [[2, 0], [0, 1], [1, 3], [1, 4]] },
  { id: "leo", ko: "사자자리", en: "Leo", from: [7, 23],
    stars: [[300, 660], [330, 480], [430, 370], [380, 210], [700, 420], [880, 580]],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 0]] },
  { id: "virgo", ko: "처녀자리", en: "Virgo", from: [8, 23],
    stars: [[450, 520], [220, 430], [560, 400], [700, 240], [620, 630], [520, 830]],
    lines: [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5]] },
  { id: "libra", ko: "천칭자리", en: "Libra", from: [9, 23],
    stars: [[280, 560], [500, 300], [720, 540], [510, 770]], lines: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  { id: "scorpio", ko: "전갈자리", en: "Scorpio", from: [10, 24],
    stars: [[720, 160], [760, 300], [610, 420], [520, 560], [480, 700], [560, 820], [720, 860]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
  { id: "sagittarius", ko: "궁수자리", en: "Sagittarius", from: [11, 23],
    stars: [[300, 500], [450, 400], [610, 440], [660, 620], [480, 700], [320, 660]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]] },
  { id: "capricorn", ko: "염소자리", en: "Capricorn", from: [12, 22],
    stars: [[180, 360], [420, 700], [700, 720], [820, 420], [500, 480]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  { id: "aquarius", ko: "물병자리", en: "Aquarius", from: [1, 20],
    stars: [[200, 300], [380, 400], [520, 330], [650, 460], [560, 640], [730, 800]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  { id: "pisces", ko: "물고기자리", en: "Pisces", from: [2, 19],
    stars: [[200, 700], [390, 640], [580, 600], [800, 560], [300, 470], [390, 260], [900, 470]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 6], [0, 4], [4, 5]] },
];

export const CONSTELLATIONS: readonly ConstellationDef[] = DEFS.map((d) => Object.freeze({ ...d, slots: d.stars.length }));

const BY_ID = new Map(CONSTELLATIONS.map((c) => [c.id, c]));

export function isSignId(value: unknown): value is SignId {
  return typeof value === "string" && BY_ID.has(value as SignId);
}

export function getConstellation(id: SignId): ConstellationDef {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown sign: ${id}`);
  return c;
}

/** Tropical sun sign for a birthday (month 1-12, day 1-31): the sign with the latest start on or before the date. */
export function sunSign(month: number, day: number): SignId {
  const md = month * 100 + day;
  if (md >= 1222 || md < 120) return "capricorn"; // wraps the new year
  const start = (c: ConstellationDef) => c.from[0] * 100 + c.from[1];
  let best: ConstellationDef | null = null;
  for (const c of CONSTELLATIONS) {
    if (c.id === "capricorn") continue;
    if (start(c) <= md && (best === null || start(c) > start(best))) best = c;
  }
  return best!.id;
}
