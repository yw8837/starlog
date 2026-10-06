// Checks content/kb/decision.ko.json (지금의 한 장 answers) and writes the slim runtime copy the
// /now page bundles: apps/web/lib/decision.generated.json (lean, answers, why per card side). The source
// keeps each side's tip and the checker still checks it, but no page reads it (634857e), so it is not shipped.
// usage: node scripts/check-decision-db.mjs            check, then write the runtime copy when clean
//        node scripts/check-decision-db.mjs --partial  check only the cards written so far (drafting)
//        node scripts/check-decision-db.mjs --strict   variety warnings fail too
// Lengths count every character, spaces included.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = join(root, "content/kb/decision.ko.json");
const kbDir = join(root, "content/kb/cards");
const outFile = join(root, "apps/web/lib/decision.generated.json");
/** Public yes/no votes per card side (docs/research, facts only). Leans that go against it need a leanNote. */
const consensusFile = join(root, "docs/research/tarot-yes-no-consensus.json");

const partial = process.argv.includes("--partial");
const strict = process.argv.includes("--strict");

const SCHEMA = "starlog-decision/1";
const LEANS = ["go", "wait", "rethink"];
const SIDES = ["upright", "reversed"];
const ANSWERS_PER_SIDE = 3;
const MAX = { answer: 20, why: 70, tip: 40, leanNote: 160 };
/** Share of all answers one ending may take before it is reported (owner: about 8%). */
const ENDING_SHARE = 0.08;

const index = JSON.parse(readFileSync(join(kbDir, "_index.json"), "utf8"));
const db = JSON.parse(readFileSync(dbFile, "utf8"));
const kb = new Map(index.ids.map((id) => [id, JSON.parse(readFileSync(join(kbDir, `${id}.json`), "utf8"))]));

const errors = [];
const warnings = [];
const err = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

// ---- banned phrases (the spirit of apps/web/lib/ai/validate.ts and style.ts) ----

const BANNED = [
  [/확률|퍼센트|100\s*%|백\s*퍼센트|점수/, "수치·확률 표현"],
  [/반드시|무조건|틀림없|절대로|확실히/, "단정 부사"],
  [/(될|올|생길|이뤄질|성공할|잘될) 거(예요|야)|이뤄져요|성공해요|합격|재회/, "결과 약속"],
  [/운명(?!의\s*(수레)?바퀴)|우주가|에너지가\s*흐르|모든 일에는 이유가|때가 되면/, "운명론 상투구"],
  [/(병|질병|질환|암)(에|이|을|를)?\s?(걸리|걸릴|진단|발병)|죽(게 되|을 거|는다|을 수도|음이)|사망|수명|임신|출산|완치|치료|사고(가 나|가 날|를 당)/, "건강·죽음·임신 언급"],
  [/(지금|당장)\s?(결제|구매)/, "결제 압박"],
  [/투자|매수|대출|주식|코인|로또|복권|대박|수익/, "돈 권유"],
  [/(그 사람|상대방?|그분|걔|그녀|그는|그가)[^.?!]{0,20}(마음|속마음|감정|진심|좋아해|사랑해|그리워해|원해|후회해|기다려)/, "다른 사람의 마음 단정"],
  [/\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일/, "날짜·요일 지정"],
  [/당신/, "'당신' 호칭"],
  // AI tells from style-rules.md
  [/(^|[.!?]\s*)(결론적으로|요약하면|정리하자면|종합하면|이를 통해|따라서|그러므로)/, "D1 결산어"],
  [/시사하는 바|주목할 만|의미가 (크|적지 않)|매우 중요|간과할 수 없/, "D2 의의 과장"],
  [/혁신적|획기적|압도적|폭발적|파격적|전례 없/, "D4 과장어"],
  [/(할|될|볼) 때(예요|입니다)|시점(이에요|입니다)/, "D6 완결 공식"],
  [/에서 [가-힣]+(으)?로 나아가|을 넘어 [가-힣]+(으)?로/, "D7 변환 공식"],
  [/[—–]|\*\*|^\s*[-*•]\s|^\s*\d+[.)]\s|\p{Extended_Pictographic}|["'“”‘’]/u, "C 서식·따옴표"],
  [/에 대(해|하여)|를 통(해|하여)|에 있어서|에 있어\s|와 관련(해|하여|된)|을 가지고 있|되어(져|지)/, "A 번역투"],
  [/(일|할) 수도 있을 (것 같|듯)|로 보여질 수|것 같아요/, "G 겹완곡"],
  [/(^|[.!?]\s*)(또한|게다가|더불어|즉|나아가|아울러)[\s,]/, "H 문두 접속어"],
  [/것이에요|필요가 있어요|새로운 장이 열/, "상투 종결"],
  [/(카드|그림|별)(이|가) (말해|속삭|알려|전해)/, "카드를 주어로 세움"],
];

/** Words too generic to count as an image detail. */
const STOP = new Set(["있다", "있고", "있는", "있으며", "보인다", "보이고", "한다", "하고", "모양", "왼쪽", "오른쪽", "위쪽", "아래쪽", "앞쪽", "뒤쪽", "가운데", "배경", "하늘", "사람", "모두", "하나", "그리고", "쪽으로", "위에", "아래", "뒤로", "앞에", "옆에", "옅은", "작은", "커다란", "멀리", "곳곳", "저마다", "서로", "그려져", "새겨져", "놓여", "달려"]);
const PARTICLE = /(으로|에서|에게|까지|부터|처럼|하고|이다|한다|된다|있다|이|가|은|는|을|를|에|의|로|와|과|도|만|엔|고|며|다)$/;

function imageStems(card) {
  const out = new Set();
  for (const fact of card.imagery.facts) {
    for (const word of fact.ko.split(/[^가-힣A-Za-z0-9]+/)) {
      const stem = word.replace(PARTICLE, "");
      if (stem.length >= 2 && !STOP.has(stem) && !STOP.has(word)) out.add(stem);
    }
  }
  return [...out];
}

/**
 * The service speaks 해요체, oracle lines too: a line ends in …요 or …죠, or is a noun or adverb
 * fragment ("완벽보다 완성", "망설임은 짧게"). A bare verb ending (…야, …해, …지, …둬, …마, …어) is 반말.
 */
const BANMAL_END = /(야|해|지|둬|돼|자|어|아|여|봐|마|와|워|려|꿔|쳐|라|니|냐|다)$/;
/** Last words that only look like verb endings: …까지 and a few nouns. */
const NOT_BANMAL = /(까지|^의지|^바다)$/;
function isBanmal(answer) {
  const line = answer.replace(/[.!]+$/, "").trim();
  if (/[요?]$|죠$/.test(line)) return false;
  const words = line.split(/\s+/);
  const last = words.at(-1) ?? "";
  const before = words.at(-2) ?? "";
  if (last === "가") return true; // "못 가"
  // 해 alone is the sun ("떠오르는 해") unless a verb leads into it ("봐야 해", "안 해").
  if (last === "해") return /[야게어아도]$/.test(before) || ["안", "못", "다"].includes(before);
  return BANMAL_END.test(line) && !NOT_BANMAL.test(last);
}

/** Same line with spacing, punctuation and a closing 요 ignored. */
const normalize = (text) => text.replace(/[\s.,!?·…~]/g, "").replace(/요$/, "");
const lastWord = (text) => text.replace(/[.!?]+$/, "").trim().split(/\s+/).at(-1) ?? "";

/** Ending patterns the owner named, checked in order; anything else is keyed by its last word. */
const FAMILIES = [
  ["~도/면 돼요·괜찮아요·좋아요", /(도|면) (돼요|돼|괜찮아요|괜찮아|좋아요|좋아)$/],
  ["~봐요", /봐(요)?$/],
  ["기다려요", /기다려(요)?$/],
  ["놓아요·놔요", /(놓아|놔)(요)?$/],
  ["물어요", /물어(요)?$/],
  ["~이에요·예요", /(이에요|예요)$/],
  ["있어요·없어요", /(있|없)어요$/],
  ["~부터·먼저", /(부터|먼저)$/],
];
function family(answer) {
  const line = answer.replace(/[.!?]+$/, "").trim();
  for (const [name, pattern] of FAMILIES) if (pattern.test(line)) return name;
  if (isBanmal(line)) return `반말 ~${line.at(-1)}`;
  return `끝말 ${lastWord(line)}`;
}

// ---- structure ----

if (db.schema !== SCHEMA) err("schema", `expected ${SCHEMA}, got ${db.schema}`);
const cards = db.cards ?? {};
for (const id of Object.keys(cards)) if (!kb.has(id)) err(id, "not in the card catalog (content/kb/cards/_index.json)");
const expected = partial ? index.ids.filter((id) => id in cards) : index.ids;
for (const id of index.ids) if (!partial && !(id in cards)) err(id, "missing");

const seen = { answer: new Map(), why: new Map(), tip: new Map() };
const allAnswers = [];
const leanCount = Object.fromEntries(LEANS.map((lean) => [lean, 0]));
let entries = 0;

function checkText(where, field, text, card) {
  if (typeof text !== "string" || text.trim() !== text || text.length === 0) return err(where, `${field} must be a trimmed, non-empty string`);
  if (text.length > MAX[field]) err(where, `${field} is ${text.length} chars (max ${MAX[field]}): ${text}`);
  if (/\n/.test(text)) err(where, `${field} has a line break`);
  for (const [pattern, label] of BANNED) if (pattern.test(text)) err(where, `${field} has a banned phrase (${label}): ${text}`);
  if (field !== "answer") {
    for (const m of card.imagery.commonMisdescriptions) {
      if (new RegExp(m.regex).test(text)) err(where, `${field} repeats a known misdescription (${m.wrong}): ${text}`);
    }
  }
}

for (const id of expected) {
  const card = kb.get(id);
  const stems = imageStems(card);
  for (const side of SIDES) {
    const where = `${id}/${side}`;
    const entry = cards[id]?.[side];
    if (!entry) {
      err(where, "missing");
      continue;
    }
    entries++;
    const keys = Object.keys(entry).sort().join(",");
    if (!["answers,lean,tip,why", "answers,lean,leanNote,tip,why"].includes(keys)) err(where, `unexpected fields: ${keys}`);
    if (!LEANS.includes(entry.lean)) err(where, `lean must be one of ${LEANS.join("/")}, got ${entry.lean}`);
    else leanCount[entry.lean]++;
    if (entry.leanNote !== undefined) checkText(where, "leanNote", entry.leanNote, card);

    if (!Array.isArray(entry.answers) || entry.answers.length !== ANSWERS_PER_SIDE) {
      err(where, `needs exactly ${ANSWERS_PER_SIDE} answers`);
    } else {
      for (const answer of entry.answers) {
        checkText(where, "answer", answer, card);
        if (/[.!]$/.test(answer)) err(where, `answer ends with punctuation: ${answer}`);
        if (isBanmal(answer)) err(where, `answer ends in 반말; use 해요체 or a noun ending: ${answer}`);
        const key = normalize(answer);
        if (seen.answer.has(key)) err(where, `answer "${answer}" repeats ${seen.answer.get(key)}`);
        else seen.answer.set(key, `${where} "${answer}"`);
        allAnswers.push({ where, answer });
      }
      const families = entry.answers.map(family);
      if (new Set(families).size < families.length) warn(where, `answers share an ending (${families.join(" / ")}); vary the angle`);
    }

    for (const field of ["why", "tip"]) {
      const text = entry[field];
      checkText(where, field, text, card);
      if (typeof text !== "string") continue;
      if (!/요\.$/.test(text)) err(where, `${field} must be one 해요체 sentence ending in "요.": ${text}`);
      if (/[.!?]\s/.test(text)) err(where, `${field} must be a single sentence: ${text}`);
      const key = normalize(text);
      if (seen[field].has(key)) err(where, `${field} repeats ${seen[field].get(key)}`);
      else seen[field].set(key, where);
    }
    if (typeof entry.why === "string" && !stems.some((stem) => entry.why.includes(stem))) {
      err(where, `why names nothing from the card's imagery facts: ${entry.why}`);
    }
  }
}

// ---- lean vs the public yes/no consensus ----
// go opposes no/lean-no and rethink opposes yes/lean-yes; a strong vote (share >= 0.9) that our lean
// does not follow (yes -> go, maybe -> wait, no -> rethink) needs a reason too. Either way the entry
// must say why in its leanNote.

const LEAN_OF = { yes: "go", maybe: "wait", no: "rethink" };
const STRONG_SHARE = 0.9;
let leanChecked = 0;
if (existsSync(consensusFile)) {
  const consensus = JSON.parse(readFileSync(consensusFile, "utf8"));
  for (const id of expected) {
    for (const side of SIDES) {
      const entry = cards[id]?.[side];
      const vote = consensus[id]?.[side];
      if (!entry || !vote) continue;
      leanChecked++;
      const label = String(vote.consensus).replace(/^lean-/, "");
      const opposes = (entry.lean === "go" && label === "no") || (entry.lean === "rethink" && label === "yes");
      const ignoresStrong = vote.consensus in LEAN_OF && vote.share >= STRONG_SHARE && entry.lean !== LEAN_OF[vote.consensus];
      if ((opposes || ignoresStrong) && !entry.leanNote) {
        err(`${id}/${side}`, `lean ${entry.lean} goes against the consensus ${vote.consensus} (${vote.share}); follow it or add a leanNote saying why`);
      }
    }
  }
} else {
  warn("consensus", `${consensusFile.slice(root.length + 1)} not found; lean check skipped`);
}

// ---- variety (soft) ----

const total = allAnswers.length;
function overused(label, keyOf) {
  const counts = new Map();
  for (const { answer } of allAnswers) {
    const key = keyOf(answer);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const limit = Math.max(3, Math.floor(total * ENDING_SHARE));
  const top = [...counts].sort((a, b) => b[1] - a[1]);
  for (const [key, n] of top) if (n > limit) warn("variety", `${label} "${key}" ends ${n}/${total} answers (limit ${limit})`);
  return top.slice(0, 8).map(([key, n]) => `${key} ${n}`).join(", ");
}
const topEndings = overused("ending", family);
const topWords = overused("last word", lastWord);
const banmal = allAnswers.filter(({ answer }) => family(answer).startsWith("반말")).length;

const field = (name) => Object.values(cards).flatMap((card) => SIDES.map((side) => card[side]?.[name] ?? ""));
const frame = field("why").filter((why) => why.includes("그림이라")).length;
if (frame > entries * 0.3) warn("variety", `"그림이라" frames ${frame}/${entries} why lines; vary the sentence shape`);
const writing = field("tip").filter((tip) => /적어|적고|써 보|써 두|써서|메모/.test(tip)).length;
if (writing > entries * 0.15) warn("variety", `${writing}/${entries} tips are writing tasks; vary the actions`);

// ---- report ----

console.log(`check-decision-db: ${entries} entries (${Object.keys(cards).length} cards), ${total} answers`);
console.log(`  lean: ${LEANS.map((lean) => `${lean} ${leanCount[lean]}`).join(", ")} (${leanChecked} checked against the yes/no consensus)`);
console.log(`  top endings: ${topEndings}`);
console.log(`  반말 lines: ${banmal}/${total}`);
console.log(`  top last words: ${topWords}`);
for (const w of warnings) console.log(`  warn ${w}`);
for (const e of errors) console.error(`  ERROR ${e}`);

if (errors.length || (strict && warnings.length)) {
  console.error(`check-decision-db: ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(1);
}

if (!partial) {
  const runtime = Object.fromEntries(
    index.ids.map((id) => [
      id,
      Object.fromEntries(SIDES.map((side) => {
        const { lean, answers, why } = cards[id][side];
        return [side, { lean, answers, why }];
      })),
    ]),
  );
  const json = JSON.stringify(runtime);
  writeFileSync(outFile, `${json}\n`);
  const raw = Buffer.byteLength(json);
  console.log(`  wrote ${outFile.slice(root.length + 1)} (${(raw / 1024).toFixed(1)} KB raw, ${(gzipSync(json).length / 1024).toFixed(1)} KB gzip)`);
}
console.log(`check-decision-db: ok (${warnings.length} warnings)`);
