#!/usr/bin/env node
/**
 * Reading-voice metrics for a reading's page text (the chapter page copied as text, docs/research/reading-voice-2026-10.md
 * §0 and §1), to compare the voice before and after a prompt change on real outputs:
 *
 *   node scripts/reading-voice-metrics.mjs <page.txt>... [--sections] [--json]
 *
 * Per reading it prints the mechanics-vs-life share, 명리 terms and brackets per section, "명리에서" count, sections that
 * open with a scene or a question, and bold phrases. The method is §0's, by rule only (the doc then corrected 45 of 450
 * saju sentences by hand, so its table can differ by a few points):
 * - Saju: the 한눈에 보기 card, the body sections, 계산 기준 (B) and the observation. Sentences end at ". ? !". C is the
 *   confirmation formula (and the voice's one "빗나감" line), X a disclaimer or a preview, A advice (an imperative),
 *   M a 명리 mechanic (a term, a glyph, a chart fact, "명리에서", "사주로 보면"; a sentence mixing a chart fact and a
 *   tendency is M, as in §0), L the rest (life scenes and tendencies). Share = M+X over M+X+L+C+A characters, without
 *   spaces, in the body sections and the observation; "with B" adds 계산 기준 as mechanics.
 * - Terms (§0): 십성, the five groups, 12운성 (a one-syllable stage only in brackets or as "X의 단계"), place words, relation
 *   words, glyph names and 간지 names (before 년·월·대운·세운 or a bracket); not 오행, 명리 or 절기 names. Brackets: every
 *   "(", hanja ones included. Both are averaged over the body sections (not 계산 기준, the observation or the card).
 * - Openings (§4.3 W3): a body section whose first two sentences hold a question or a scene ("~할 때", "~한 적").
 * - Bold: "**구**" pairs. A page copied with innerText loses <strong>, so count bold on text that keeps the marks.
 * - Tarot (§1.5): I (the picture) joins M and X as mechanics; terms are device words (역방향, 자리, 원소, 그늘) a card
 *   section; openings are card sections that open on the picture rather than a lone "역방향으로 나왔어요".
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const showSections = args.includes("--sections");
const asJson = args.includes("--json");
if (!files.length) {
  console.error("usage: node scripts/reading-voice-metrics.mjs <page.txt>... [--sections] [--json]");
  process.exit(1);
}

const chars = (text) => text.replace(/\s|\*\*/g, "").length;
const sentencesOf = (text) => text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
const count = (text, re) => text.match(re)?.length ?? 0;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);

// ---- parsing ----

/** Non-empty lines grouped by the blank lines between them. */
function blocksOf(lines) {
  const blocks = [];
  let current = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line) current.push(line);
    else if (current.length) (blocks.push(current), (current = []));
  }
  if (current.length) blocks.push(current);
  return blocks;
}

const MARK = /^[→✔⚠︎️\s]+$/;
const CARD_LABELS = ["잘 풀리는 쪽", "조심할 쪽", "이렇게 보완", "올해 흐름", "올해 해 볼 일"];

/** The card's five sentences, then each section as [label, subtitle] and its body, up to the follow-up box. */
function parseSaju(lines) {
  let i = lines.findIndex((l) => l.trim() === "한눈에 보기");
  const card = [];
  for (const label of CARD_LABELS) {
    const at = lines.findIndex((l, j) => j > i && l.trim() === label);
    if (at < 0) continue;
    let j = at + 1;
    while (j < lines.length && (!lines[j].trim() || MARK.test(lines[j].trim()))) j++;
    card.push(lines[j].trim());
    i = j;
  }
  const end = lines.findIndex((l, j) => j > i && /^이어서 물어보기 ·/.test(l.trim()));
  const blocks = blocksOf(lines.slice(i + 1, end < 0 ? lines.length : end));
  const sections = [];
  for (let k = 0; k + 1 < blocks.length; k++) {
    if (blocks[k].length !== 2) continue;
    const [label, subtitle] = blocks[k];
    const kind = label === "계산 기준" ? "basis" : label === "앞으로 몇 주" ? "observation" : "body";
    sections.push({ label, subtitle, kind, body: blocks[k + 1].join(" ") });
    k++;
  }
  return { card, sections };
}

/** The verdict, the card sections (a position, "카드 · 뜻", the body) and every other prose line, up to the follow-up box. */
function parseTarot(lines) {
  const start = lines.findIndex((l) => l.trim() === "한 줄 결론");
  const end = lines.findIndex((l, j) => j > start && /^이어서 물어보기 ·/.test(l.trim()));
  const blocks = blocksOf(lines.slice(start + 1, end < 0 ? lines.length : end));
  const verdict = blocks[0]?.join(" ") ?? "";
  const cards = [];
  const prose = [];
  for (let k = 1; k < blocks.length; k++) {
    const block = blocks[k];
    if (block.length === 1 && blocks[k + 1]?.length === 1 && blocks[k + 1][0].includes(" · ") && blocks[k + 2]) {
      cards.push({ label: block[0], heading: blocks[k + 1][0], body: blocks[k + 2].join(" ") });
      k += 2;
      continue;
    }
    // prose: a line that ends a sentence (labels, chips, "복사" and the avoid list do not)
    for (const line of block) if (/[.?!]$|요$/.test(line) && chars(line) >= 15) prose.push(line);
  }
  return { verdict, cards, prose };
}

// ---- 명리 terms (§0) ----

const STEMS_KO = "갑을병정무기경신임계";
const BRANCHES_KO = "자축인묘진사오미신유술해";
const SIXTY_KO = Array.from({ length: 60 }, (_, i) => STEMS_KO[i % 10] + BRANCHES_KO[i % 12]);
const GLYPH = "(?:[갑을병정무기경신임계](?:목|화|토|금|수))";
/** 지지 is support far more often than the term: only beside 천간, a pillar, a layer or as a place (as lib/ai/plainWords.ts). */
const BRANCH_TERM = [
  "(?<=\\()지지(?=\\))",
  "(?<=천간[^.?!\\n]{0,12})지지",
  "지지(?=[^.?!\\n]{0,12}천간)",
  "(?<=(?:대운|세운|원국|명식|기둥|[년월일시]주|월건)의?\\s)지지",
  "지지(?=\\s?\\(地支\\)|에(?!\\s?(?:힘입|기대|감사|보답))|의?\\s?(?:본기|대표|글자|자리)|끼리)",
].map((context) => `(?<![가-힣\\d])${context}`).join("|");
const SEUN_PLAN = "계획|목표|기준|약속|규칙|원칙|일정|다짐|순서|예산|전략|루틴|방향|방침|경계";

const TERM_PATTERNS = [
  // 십성 and "십성" itself
  /(?<![가-힣])(?:비견|겁재|식신|상관(?!없|이 없|하지|하고|할)|편재|정재|편관|정관|편인|정인|십성)/g,
  // the five groups
  /(?<![가-힣])(?:비겁|식상(?![하한해할함했])|재성|관성(?!처럼|적|대로)|인성(?!이?\s?(?:좋|바르|바른|착하|착한|나쁘|나쁜|훌륭|뛰어나)))/g,
  // 12운성
  /(?<![가-힣])(?:장생|목욕|관대(?![하한히함])|건록|임관|제왕|12운성)/g,
  /\((?:쇠|병|사|묘|절|태|양)\)|(?<![가-힣])묘는|(?<![가-힣])(?:쇠|병|사|묘|절|태|양)(?=의 단계| 단계)|(?<=단계(?:로는|는|인|가) )(?:쇠|병|사|묘|절|태|양)(?=[이예고으,.\s])/g,
  // place words
  /(?<![가-힣])(?:원국|명식|천간(?![합충])|일간|일지|월지|월간|년간|년지|시지|월령|지장간|본기|대운|월건|연주|년주|월주|일주(?!일)|시주|양간|음간|절입|월률분야|간지)/g,
  new RegExp(`(?<![가-힣]|[을를]\\s|(?:${SEUN_PLAN})\\s)세운(?!\\s?(?:${SEUN_PLAN}|뜻|틀|선을|뒤|후(?!반)|대로))`, "g"),
  new RegExp(BRANCH_TERM, "g"),
  new RegExp(`(?<![가-힣])시간(?=\\s?(?:${GLYPH}|[甲乙丙丁戊己庚辛壬癸])|의\\s${GLYPH}|에는\\s[^.?!]{0,30}(?:시지|일간|년간|월간))`, "g"),
  /(?<![가-힣])(?:여기|중기|정기)(?=에\s?[갑을병정무기경신임계](?:목|화|토|금|수)|·|\)|를\s?본기|라고)|(?<=[(·])(?:여기|중기|정기)/g,
  // relation words
  /육합|삼합|방합|반합|천간합|천간충|자형|삼형|상형/g,
  /(?<![가-힣])(?:합|충|형|파|해)(?=\((?:合|沖|衝|刑|破|害)\))/g,
  /(?<![가-힣])충(?=[,.)]|이\s|을\s|의\s|으로|과\s|도\s|$)/g,
  /(?<![가-힣])(?:파|형|합)(?=의\s?관계|가\s?있|이\s?있|를\s?이|을\s?이|으로도)|(?<=[와과]는?\s)(?:해|파|형)(?=[,.])/g,
  // glyph and 간지 names
  new RegExp(`(?<![가-힣])(?:갑목|을목|병화|정화|무토|기토|경금|신금|임수|계수|자수(?!성가)|축토|인목|묘목|진토|사화|오화|미토|유금|술토|해수(?!욕))`, "g"),
  new RegExp(`(?<![가-힣])(?:${SIXTY_KO.join("|")})(?=년|월(?!요)|\\(|\\s?(?:대운|세운))`, "g"),
  /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥](?=\()/g,
];
const termsOf = (text) => sum(TERM_PATTERNS.map((re) => count(text, re)));

// ---- sentence classes (§0) ----

const CONFIRM = /맞물리|맞물려|덜 맞|덜 들어맞|비켜 간|비껴 ?가|빗나간|이 읽기(?:와|가|에)|들어맞|맞게 읽힌|맞아떨어|가볍게 넘겨도 돼요/;
const DISCLAIM = /라벨(?:은|을)? (?:붙이지|쓰지)|판단하지 않|따지지 않|사건(?:으로 (?:읽|보)지|이 아니라|의 신호로)|불운이 아니라|좋고 나쁨이 아니라|있다는 사실만|볼게요|짚을 것이 있어요|다음 이야기예요|관점일 뿐|이름표가 아니라|약속은 아니에요/;
/** An imperative or a suggestion ("~해 보세요", "~해 봐요"), not an interpretation frame ("~로 봐요", "~다고 보면 돼요"). */
const ADVICE = /(?:세요|[아어여해] 봐요|[아어여해] 둬요|해 보면 좋아요)[.!]?$/;
/** A chart fact or the chart as the subject of an interpretation (§0 M), the voice's one-phrase basis included. */
const CHART_FACT = new RegExp([
  "명리에서|사주(?:로 보면|에|의|는|가|라서|라 )|명식|원국|나를 (?:나타내는|뜻하는) 글자|글자 (?:속|전체)",
  "(?:태어난 (?:해|달|날|시)|가장 가까운|바깥 무대를 뜻하는|바탕을 뜻하는)[^.?!]{0,8}(?:자리|기둥)",
  "(?<![가-힣])(?:이|그|같은) 자리(?:가|는|의|에서|예요|죠|를)|뿌리|대표 (?:기운|글자)|곁에 깃든|숨은 기운|숨어 있",
  "\\d개|넷이나|셋이나|둘이나|하나도 없|한 글자도 없|겉에 (?:없|하나|둘|셋|넷)|(?:큰 흐름|한 해의 흐름)\\(",
  "기운이 [^.?!]{0,10}(?:가장 많|가장 적|없어)|(?:기운|힘)이 (?:실리|실려|실린|붙|겹|얹|깃든|쏠려)",
  "국면|구조(?:예요|이에요|죠|라|가|를|로)|배치(?:라|예요|이에요|도|가)|로 읽어요|로 읽혀요|로 읽히|로 봐요|다고 봐요|다고 보면 돼요",
  "[一-鿿]",
].join("|"));

function sajuClass(sentence) {
  if (CONFIRM.test(sentence)) return "C";
  if (DISCLAIM.test(sentence)) return "X";
  if (ADVICE.test(sentence)) return "A";
  if (termsOf(sentence) > 0 || CHART_FACT.test(sentence)) return "M";
  return "L";
}

const TAROT_DISCLAIM = /카드로(?:는)? (?:알 수 없|정할 수 없|말할 수 없)|사실로 말하(?:지|진) 않|단정(?:하지|할 수) 않|짐작할 뿐|분위기까지만|우선해|로 읽었어요|조건을 바꾼 뒤 다시|로 읽지(?:는)? 않/;
const PICTURE = /그림|모양|들고|쥐고|서 있|앉아|매달|묶여|올라서|내려다|올려다|머리 ?위|머리에|발밑|발치|등 뒤|하늘|구름|바다|강물|말을 타|말 위|월계관|지팡이|갑옷|해골|두건|망토|옷자락|기둥|사자|천사|나무로 된|손이 |팔짱|끌어안|가슴에|젊은이|노인|여인|기사|사람이 /;
const DEVICE = /역방향|정방향|자리(?:에서는|는|의 |라서|에 놓)|원소|메이저|마이너|(?:불|물|흙|공기)의 (?:카드|두 장|한 장)|장의 (?:불|물)|로 읽어요|로 읽혀요|로 읽을|그늘/;
const DEVICE_WORDS = /역방향|정방향|자리|원소|그늘|(?:불|물|흙|공기)의 (?:카드|두 장|한 장)/g;

function tarotClass(sentence) {
  if (/맞다면|들어맞|빗나/.test(sentence)) return "C";
  if (TAROT_DISCLAIM.test(sentence)) return "X";
  if (ADVICE.test(sentence)) return "A";
  if (PICTURE.test(sentence) && !/처럼/.test(sentence)) return "I";
  if (DEVICE.test(sentence)) return "M";
  return "L";
}

/** Characters by class over `texts`. */
function shares(texts, classify) {
  const by = {};
  for (const sentence of texts.flatMap(sentencesOf)) {
    const c = classify(sentence);
    by[c] = (by[c] ?? 0) + chars(sentence);
  }
  return by;
}
const pct = (part, whole) => (whole ? (100 * part) / whole : 0);

// ---- the five metrics ----

const SCENE = /\?|(?:할|한|했을|하던|받을|생길|올) (?:때|적)|적(?: 이)? (?:많|있)/;
const BOLD = /\*\*[^*\n]+?\*\*/g;

function sajuMetrics(name, text) {
  const { card, sections } = parseSaju(text.split(/\r?\n/));
  const bodies = sections.filter((s) => s.kind === "body");
  const observation = sections.filter((s) => s.kind === "observation");
  const basis = sections.filter((s) => s.kind === "basis");
  const by = shares([...bodies, ...observation].map((s) => s.body), sajuClass);
  const mech = (by.M ?? 0) + (by.X ?? 0);
  const all = sum(Object.values(by));
  const b = sum(basis.map((s) => chars(s.body)));
  const reading = [...card, ...sections.map((s) => s.body)].join("\n");
  return {
    name, kind: "saju",
    sections: bodies.length,
    mechanics: pct(mech, all),
    mechanicsWithBasis: pct(mech + b, all + b),
    classes: by,
    termsPerSection: avg(bodies.map((s) => termsOf(s.body))),
    parensPerSection: avg(bodies.map((s) => count(s.body, /\(/g))),
    myeongriEseo: count(reading, /명리에서/g),
    sceneOpenings: bodies.filter((s) => SCENE.test(sentencesOf(s.body).slice(0, 2).join(" "))).length,
    bold: count(reading, BOLD),
    detail: [...bodies, ...observation, ...basis].map((s) => ({
      label: s.label, chars: chars(s.body), sentences: sentencesOf(s.body).length, terms: termsOf(s.body), parens: count(s.body, /\(/g),
      opensOnScene: SCENE.test(sentencesOf(s.body).slice(0, 2).join(" ")),
    })),
  };
}

function tarotMetrics(name, text) {
  const { verdict, cards, prose } = parseTarot(text.split(/\r?\n/));
  const by = shares([...cards.map((c) => c.body), ...prose], tarotClass);
  const mech = (by.I ?? 0) + (by.M ?? 0) + (by.X ?? 0);
  const all = sum(Object.values(by));
  const reading = [verdict, ...cards.map((c) => c.body), ...prose].join("\n");
  return {
    name, kind: "tarot",
    sections: cards.length,
    mechanics: pct(mech, all),
    mechanicsWithBasis: null,
    classes: by,
    termsPerSection: avg(cards.map((c) => count(c.body, DEVICE_WORDS))),
    parensPerSection: avg(cards.map((c) => count(c.body, /\(/g))),
    myeongriEseo: count(reading, /명리에서/g),
    sceneOpenings: cards.filter((c) => tarotClass(sentencesOf(c.body)[0] ?? "") === "I").length,
    bold: count(reading, BOLD),
    positionFrames: count(reading, /자리(?:에서는|는) /g),
    detail: cards.map((c) => ({
      label: c.label, chars: chars(c.body), sentences: sentencesOf(c.body).length, terms: count(c.body, DEVICE_WORDS), parens: count(c.body, /\(/g),
      opensOnScene: tarotClass(sentencesOf(c.body)[0] ?? "") === "I",
    })),
  };
}

const results = files.map((file) => {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  const name = basename(file).replace(/\.txt$/, "");
  if (text.includes("한눈에 보기") && text.includes("계산 기준")) return sajuMetrics(name, text);
  if (text.includes("한 줄 결론")) return tarotMetrics(name, text);
  return { name, kind: "unknown" };
});

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const f1 = (n) => n.toFixed(1);
  for (const r of results) {
    if (r.kind === "unknown") {
      console.log(`${r.name}: not a saju or tarot reading page`);
      continue;
    }
    const opening = r.kind === "saju" ? "scene/question openings" : "picture openings";
    const terms = r.kind === "saju" ? "명리 terms/section" : "device words/card";
    const withBasis = r.mechanicsWithBasis === null ? "" : ` (with 계산 기준 ${f1(r.mechanicsWithBasis)}%)`;
    const frames = r.kind === "tarot" ? ` · position frames ${r.positionFrames}` : "";
    console.log(`${r.name} [${r.kind}] mechanics ${f1(r.mechanics)}%${withBasis} · ${terms} ${f1(r.termsPerSection)} · brackets/section ${f1(r.parensPerSection)} · 명리에서 ${r.myeongriEseo} · ${opening} ${r.sceneOpenings}/${r.sections} · bold ${r.bold}${frames}`);
    if (showSections) {
      for (const d of r.detail) console.log(`    ${d.label}: ${d.chars}자 ${d.sentences}문장 · terms ${d.terms} · brackets ${d.parens} · ${d.opensOnScene ? "opens on a scene" : "opens on a fact"}`);
    }
  }
  for (const kind of ["saju", "tarot"]) {
    const rs = results.filter((r) => r.kind === kind);
    if (rs.length < 2) continue;
    console.log(`= ${kind} ×${rs.length}: mechanics ${f1(avg(rs.map((r) => r.mechanics)))}% · terms ${f1(avg(rs.map((r) => r.termsPerSection)))} · brackets ${f1(avg(rs.map((r) => r.parensPerSection)))} · 명리에서 ${sum(rs.map((r) => r.myeongriEseo))} · openings ${sum(rs.map((r) => r.sceneOpenings))}/${sum(rs.map((r) => r.sections))} · bold ${sum(rs.map((r) => r.bold))}`);
  }
}
