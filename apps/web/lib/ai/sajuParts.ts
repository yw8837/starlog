import "server-only";
import type { SajuElement, SinsalName } from "@starlog/core";
import { hasFinalConsonant } from "@/lib/korean";
import { SAJU_GAEUN_HEADING, SAJU_MAIN_SECTIONS, SAJU_NAMES_HEADING, SAJU_PART_A_SECTIONS, SAJU_PART_B_SECTIONS, SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { ELEMENT_WORD, ORDER, type SajuFactSet } from "./prompts/saju";
import type { SajuEnrichment, SajuReading, SajuReadingPartA, SajuReadingPartB } from "./schemas";

/**
 * 정통 사주 in two parts (review 2026-10-08, B): the main call's sections 1–6 and 계산 기준, and 7절·8절 from their own call.
 * Here: how they merge, and the code-built 7절·8절 the reading falls back to when that call fails, times out or stays
 * invalid, so a paid reading never fails because of it (the mock answers with the same text). It is built from the facts'
 * tables (lib/sajuEnrichment.ts: the names' meanings and places, the 개운 row) in the reading voice: a scene question, one
 * plain reason, a tendency in bold, everyday acts.
 */

/** "문창귀인은", "역마는". */
const topic = (word: string) => `${word}${hasFinalConsonant(word) ? "은" : "는"}`;

// ---- 이름표 풀이 (7절) ----

/** What a name leans toward (bold) and a scene it shows in. */
const NAME_PLAIN: Record<SinsalName, { lean: string; scene: string }> = {
  천을귀인: { lean: "막힐 때 혼자 버티기보다 먼저 묻는", scene: "일이 꼬인 날에도 누군가에게 한마디 건넨 뒤에야 길이 보이곤 해요." },
  문창귀인: { lean: "생각을 말과 글로 꺼내 정리하는", scene: "머릿속에만 두던 생각도 누군가에게 말로 풀어 보고 나서야 또렷해지곤 해요." },
  학당귀인: { lean: "배운 것을 차곡차곡 쌓아 가는", scene: "새로 배운 것이 있으면 한 번 듣고 끝내기보다 손에 익을 때까지 붙들곤 해요." },
  도화: { lean: "사람들 앞에서 표현이 살아나는", scene: "여럿이 모인 자리에서 내 말에 사람들이 귀를 기울이는 순간이 종종 찾아오곤 해요." },
  역마: { lean: "자리를 옮기며 생각이 풀리는", scene: "한자리에 오래 앉아 있을 때보다 걷거나 자리를 바꾼 뒤에 답이 떠오르곤 해요." },
  화개: { lean: "혼자 깊이 파고들 때 힘이 나는", scene: "좋아하는 일 하나에 빠지면 주변 소리가 들리지 않을 만큼 오래 붙들곤 해요." },
};

const PLACE_PLAIN: Record<string, string> = { 연지: "태어난 해 자리", 월지: "태어난 달 자리", 일지: "태어난 날 자리", 시지: "태어난 시 자리" };

/** Where a place shows first, in plain words. */
const PLACE_SHOWS: Record<string, string> = {
  "태어난 해 자리": "어릴 때부터 익숙한 바탕과 닿은 자리라서, 이 이름도 오래된 습관 속에서 먼저 보이기 쉬워요.",
  "태어난 달 자리": "일하고 배우는 바깥 무대와 닿은 자리라서, 이 이름도 일하는 장면에서 먼저 보이기 쉬워요.",
  "태어난 날 자리": "나와 가장 가까운 자리라서, 이 이름도 하루하루의 습관이나 가까운 사람 곁에서 먼저 보이기 쉬워요.",
  "태어난 시 자리": "혼자 보내는 시간과 닿은 자리라서, 이 이름도 혼자 있는 장면에서 먼저 보이기 쉬워요.",
};

/** "연지 辰 → 일지 寅" → "태어난 날 자리(寅)". */
function placeOf(hit: string): string {
  const [place = "", glyph = ""] = (hit.split(" → ")[1] ?? "").split(" ");
  return `${PLACE_PLAIN[place] ?? place}(${glyph})`;
}

/** "태어난 날 자리(寅)와 태어난 달 자리(申)": every place a name lands on, each once. */
function placesOf(hits: readonly string[]): string {
  const places = [...new Set(hits.map(placeOf))];
  return places.length === 1 ? places[0]! : `${places.slice(0, -1).join(", ")}와 ${places.at(-1)}`;
}

/** One sentence a name, its place and its meaning, in three rotating forms so the endings do not repeat. */
function nameSentence(s: SajuFactSet["sinsal"][number], i: number): string {
  const places = placesOf(s.hits);
  if (i % 3 === 0) return `${topic(s.name)} ${places}에서 나왔고, ${s.meaning}이에요.`;
  if (i % 3 === 1) return `${places}에서 나온 ${topic(s.name)} ${s.meaning}이고요.`;
  return `${places}에는 ${s.name}도 보이는데, ${s.meaning}이죠.`;
}

const OPENING = "누가 나를 한마디로 소개해 줄 때, 그 말이 생각보다 내 모습과 닮아서 고개를 끄덕인 적 있지 않나요?";
const charCount = (texts: string[]) => texts.join("").replace(/\s|\*\*/g, "").length;

/** What the most of the visible glyphs makes easy (the strength a chart with no name gets). */
const STRENGTH: Record<SajuElement, string> = {
  목: "새로 시작하고 키워 가는 일",
  화: "드러내고 알리는 일",
  토: "버티며 사이를 잇는 일",
  금: "정리하고 마무리하는 일",
  수: "생각하고 알아보는 일",
};

function nameplateText(f: SajuFactSet): string {
  const [first] = f.sinsal;
  if (!first) {
    const counts = f.elements.counts;
    const max = Math.max(...ORDER.map((e) => counts[e]));
    const top = ORDER.find((e) => counts[e] === max)!;
    return [
      OPENING,
      "사주에서 흔히 찾아보는 여섯 가지 이름표를 하나씩 짚어 봤지만, 이 사주에는 따로 붙은 이름이 없어요.",
      "도움을 청하는 쪽, 배움과 표현, 움직임과 몰입처럼 이름표가 가리키는 쪽 가운데 어느 한쪽으로 크게 기울지 않았다는 뜻이에요.",
      "이름표가 없다고 모자란 사주는 아니고, 이 사주에서 먼저 보이는 힘이 따로 있다는 뜻이기도 해요.",
      `대신 ${ELEMENT_WORD[top]} 기운이 ${max}개로 가장 많아서 **${STRENGTH[top]}을 맡을 때** 손이 먼저 가기 쉬워요.`,
      "남들이 미뤄 둔 그런 일을 어느새 내가 먼저 집어 들고, 끝까지 붙들어 깔끔하게 마무리하곤 해요.",
      "그런 일을 맡는 날에는 **먼저 끝낼 한 가지**를 아침에 정해 두고, 그 일부터 손대 보세요.",
    ].join(" ");
  }
  const many = f.sinsal.length > 1;
  const plain = NAME_PLAIN[first.name as SinsalName];
  const names = f.sinsal.map(nameSentence);
  const close = [
    `${many ? "이 이름들은" : "이 이름은"} 앞으로 무슨 일이 생긴다는 예고가 아니라, 이 사주가 평소에 자주 기우는 쪽에 붙여 둔 이름표라서 맞는 대목만 가져가도 충분해요.`,
    `${many ? "이 가운데 가장 내 얘기 같은 이름 하나를 골라" : "이 이름이 내 얘기 같다면"}, 이번 주에 그쪽으로 **작은 일 하나를 직접 해 보고** 그날 기분이 어땠는지 떠올려 보세요.`,
  ];
  // the tendency while a sentence is left (eight at most), then a scene and the first place in words while the section runs short
  const firstPlace = placeOf(first.hits[0]!).replace(/\([^)]*\)$/, "");
  const optional = [plain.scene, `${firstPlace}는 ${PLACE_SHOWS[firstPlace] ?? "이 이름이 먼저 보이는 자리예요."}`];
  const middle: string[] = [];
  const sentences = () => 1 + names.length + middle.length + close.length;
  if (sentences() < 8) middle.push(`${many ? `그중 ${topic(first.name)}` : "이 이름은"} **${plain.lean}** 쪽으로 먼저 드러나기 쉬워요.`);
  for (const extra of optional) {
    if (sentences() >= 8 || charCount([OPENING, ...names, ...middle, ...close]) >= 300) break;
    middle.push(extra);
  }
  return [OPENING, ...names, ...middle, ...close].join(" ");
}

// ---- 기운 채우기 (8절) ----

/** The tendency a scarce element leaves (bold) and a scene it shows in. */
const SCARCE_PLAIN: Record<string, { lean: string; scene: string }> = {
  나무: { lean: "새로 시작하는 일을 미루기", scene: "해 보고 싶던 일도 준비만 길어지다가 첫발을 떼기까지 한참 걸리곤 해요." },
  불: { lean: "드러내는 데 머뭇거리기", scene: "해 둔 일이 있어도 보여 줄 때를 재다가 그냥 넘어가고, 시작할 힘이 나기까지 한참 걸리곤 해요." },
  흙: { lean: "하루 리듬이 흐트러지기", scene: "바쁜 날이 이어지면 밥때와 잠자리에 드는 시간이 들쭉날쭉해지고, 그 뒤로 며칠씩 어수선하곤 해요." },
  쇠: { lean: "끝맺음을 뒤로 미루기", scene: "거의 다 끝낸 일도 마지막 한 걸음을 남겨 둔 채 다음 일로 넘어가곤 해요." },
  물: { lean: "쉬어 갈 틈을 놓치기", scene: "할 일을 하나 끝내면 숨 돌릴 틈도 없이 다음 일을 바로 집어 들곤 해요." },
};

const wordOf = (element: string) => element.replace(/\(.*$/, "");

function gaeunText(f: SajuFactSet): string {
  const [scarce, ...tied] = f.scarce;
  if (!scarce) return "";
  const word = wordOf(scarce.element);
  const plain = SCARCE_PLAIN[word]!;
  const colour = scarce.colour.split("·")[0]!;
  return [
    "하루를 마치고 돌아보면 유난히 한쪽 일만 붙들다가 다른 쪽은 손도 못 댄 날이 있지 않아요?",
    `사주로 보면 ${f.elements.glyphCount === 8 ? "여덟" : "여섯"} 글자 가운데 ${word} 기운이 ${scarce.count}개라서 **${plain.lean}** 쉬워요.`,
    plain.scene,
    scarce.hidden
      ? `그래도 겉에 없을 뿐 안쪽에는 숨은 ${word} 기운이 있어서, 곁에 조금만 두어도 손이 먼저 가기 쉬워요.`
      : scarce.count === 0
        ? "겉에도 안쪽에도 없는 기운이라, 곁에 두는 것부터 가볍게 시작해 볼 만해요."
        : "아주 없지는 않아도 다른 기운보다 덜 보이는 기운이라, 일부러 곁에 둘 때 더 잘 느껴져요.",
    ...(tied.length ? [`${tied.map((t) => wordOf(t.element)).join("·")} 기운도 같은 개수라 함께 떠올려도 좋아요.`] : []),
    `책상 위에는 ${colour} 포인트 하나를 놓아 두고, ${scarce.environment[0]}처럼 작은 변화도 하나 만들어 보세요.`,
    scarce.direction.endsWith("쪽")
      ? `산책할 때는 ${scarce.direction}으로 난 길을 따라 한 바퀴 걸어 보고, 책상에 앉을 때도 그쪽을 보는 자리면 좋아요.`
      : `책을 읽거나 쉴 때는 ${scarce.direction} 자리에 앉아 보고, 그 둘레를 가지런히 정리해 두면 좋아요.`,
    `미루고 싶은 날에는 **${scarce.habits[0]}**부터 가볍게 해 보고, 시간이 나면 ${scarce.habits[1] ?? scarce.habits[0]}까지 챙겨 봐도 좋아요.`,
  ].join(" ");
}

/** 7절·8절 built from the tables, in the reading voice: the fallback of their own call, and the mock's answer. */
export function sajuEnrichmentFallback(f: SajuFactSet): SajuEnrichment {
  return { nameplate: nameplateText(f), gaeun: gaeunText(f) };
}

// ---- merge ----

/**
 * The main call's halves (owner 2026-10-16) as the one main draft they replace: 1–6절 and 계산 기준 in SAJU_MAIN_SECTIONS order
 * under code-owned headings, the second half's observation and card, the first half's follow-up questions.
 */
export function joinSajuHalves(a: SajuReadingPartA, b: SajuReadingPartB): SajuReading {
  const bodyOf = (heading: string) => {
    const i = SAJU_PART_A_SECTIONS.indexOf(heading);
    return (i >= 0 ? a.sections[i] : b.sections[SAJU_PART_B_SECTIONS.indexOf(heading)])?.body ?? "";
  };
  return { sections: SAJU_MAIN_SECTIONS.map((heading) => ({ heading, body: bodyOf(heading) })), observation: b.observation, glance: b.glance, followUps: a.followUps };
}

/** The nine sections in reading order under code-owned headings: the main call's 1–6, 7절·8절, the main call's 계산 기준. */
export function mergeSajuReading(main: SajuReading, enrichment: SajuEnrichment): SajuReading {
  const bodyOf = (heading: string) => main.sections[SAJU_MAIN_SECTIONS.indexOf(heading)]?.body.trim() ?? "";
  return {
    ...main,
    sections: SAJU_PROLOGUE_SECTIONS.map((heading) => ({
      heading,
      body: heading === SAJU_NAMES_HEADING ? enrichment.nameplate.trim() : heading === SAJU_GAEUN_HEADING ? enrichment.gaeun.trim() : bodyOf(heading),
    })),
  };
}
