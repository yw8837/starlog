// Review sheets.   node review.mjs   -> review/prototype-v2.png
// Per card: old prototype (v1) -> 1 original (1909 scan) -> 2 simplified -> 3 character (frame A | frame B),
// then the 90 px row (+ squint), the blind "name the card" row and the self-test numbers.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { launch } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(HERE, ".build", "review");
await mkdir(OUT, { recursive: true });
const url = (p) => `file:///${p.replace(/\\/g, "/")}`;
const deck = JSON.parse(readFileSync(path.join(ROOT, "deck.json"), "utf8"));
const selftest = JSON.parse(readFileSync(path.join(ROOT, "review", "selftest.json"), "utf8"));

const NOTES = {
  "major-00-fool": {
    kept: "해는 오른쪽 위, 인물은 한가운데서 고개를 들고 절벽 끝으로 내딛는다. 어깨 위 막대와 보따리, 뻗은 손의 흰 장미, 발치의 강아지(토끼).",
    blind: "절벽 끝으로 한 발 내딛는 인물, 막대 끝 보따리, 해, 발치에서 뛰어오르는 동행 → 바보(The Fool). 확신 높음.",
  },
  "major-01-magician": {
    kept: "한 팔은 지팡이를 높이, 한 팔은 땅을 가리키는 대각선. 머리 위 ∞, 탁자 위 컵·펜타클·칼·지팡이, 아래의 장미와 백합.",
    blind: "한 손 위(지팡이), 한 손 아래(가리킴), 머리 위 ∞, 탁자 위 네 도구 → 마법사(The Magician). 확신 높음.",
  },
  "major-17-star": {
    kept: "하늘에 큰 별 하나와 작은 별 일곱, 연못 쪽으로 몸을 숙여 한 무릎을 꿇고 두 항아리를 붓는다(하나는 연못, 하나는 땅·물줄기 다섯). 나무 위 새.",
    blind: "큰 별 + 작은 별 일곱, 두 항아리를 연못과 땅에 붓는 인물 → 별(The Star). 확신 높음.",
  },
};
const ids = ["major-00-fool", "major-01-magician", "major-17-star"];

const card = (src, cls = "") => `<div class="card ${cls}"><img src="${url(src)}"></div>`;
const tile = (src, cap, sub, cls = "") => `<div class="tile">${card(src, cls)}<div class="cap">${cap}<em>${sub}</em></div></div>`;
const arrow = (t) => `<div class="arrow">${t}</div>`;

function rows() {
  return ids
    .map((id) => {
      const m = deck.cards.find((c) => c.id === id);
      const st = path.join(ROOT, "stages", id);
      return `
      <section class="row">
        <h2><span class="n">${m.numeral}</span>${m.ko}<small>${m.en}</small></h2>
        <p class="kept">${NOTES[id].kept}</p>
        <div class="tiles">
          ${tile(path.join(ROOT, "prototype", "render", `${id}.png`), "이전 프로토타입 v1", "캐릭터가 크고 배경이 복잡했다", "old")}
          ${arrow("⇒")}
          ${tile(path.join(st, "1-original.webp"), "① 원본", "1909 스캔 (구도·포즈·시선)")}
          ${arrow("→")}
          ${tile(path.join(st, "2-simplified.png"), "② 단순화", "필수 상징만 크게, 평면 도형")}
          ${arrow("→")}
          ${tile(path.join(st, "3-character-A.png"), "③ 캐릭터화 · 프레임 A", "번호 + 이름")}
          <div class="gap"></div>
          ${tile(path.join(st, "3-character-B.png"), "③ 캐릭터화 · 프레임 B", `번호 + 이름 + 키워드 "${m.keyword}"`)}
        </div>
      </section>`;
    })
    .join("");
}

function row90() {
  const groups = ids
    .map((id) => {
      const st = path.join(ROOT, "stages", id);
      const imgs = [path.join(ROOT, "prototype", "render", `${id}.png`), path.join(st, "1-original.webp"), path.join(st, "2-simplified.png"), path.join(st, "3-character-A.png"), path.join(st, "3-character-B.png")]
        .map((p) => `<img class="s90" src="${url(p)}">`)
        .join("");
      const squint = `<img class="s90" src="${url(path.join(HERE, ".build", "selftest", `${id}-squint.png`))}">`;
      return `<div class="g90"><div class="imgs">${imgs}</div><div class="lbl">v1 · 원본 · 단순화 · A · B</div>
        <div class="imgs">${squint}</div><div class="lbl">③A를 90px로 줄여 흐리게(squint)</div></div>`;
    })
    .join("");
  return `<div class="g90s">${groups}</div>`;
}

function tests() {
  const per = ids
    .map((id) => {
      const m = deck.cards.find((c) => c.id === id);
      const r = selftest.results[id];
      const lines = r.symbols.map((s) => `<tr class="${s.verdict}"><td>${s.symbol}</td><td>${s.rank}</td><td>${s.bbox90}</td><td>${s.dL}</td><td>${s.verdict}</td></tr>`).join("");
      return `<div class="tcol">
        <h4>${m.numeral} ${m.ko}</h4>
        <img class="blind" src="${url(path.join(HERE, ".build", "selftest", `${id}-blind.png`))}">
        <p class="guess"><b>이름 맞히기(작성자 자가 판정)</b><br>${NOTES[id].blind}</p>
        <table><tr><th>상징(90px 기준)</th><th>순위</th><th>크기 px</th><th>대비 ΔL</th><th></th></tr>${lines}</table>
      </div>`;
    })
    .join("");
  return `<div class="tests">${per}</div>`;
}

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{background:radial-gradient(1500px 800px at 50% -8%,#2e2a78 0%,#15113a 55%,#0d0a26 100%);color:#f1ecff;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;padding:44px 52px 56px;width:1900px}
h1{font-family:"Noto Serif KR",serif;font-size:34px;color:#f3dca1;letter-spacing:.03em}
.sub{margin-top:8px;font-size:16px;color:#bdb3e6;line-height:1.6;max-width:1500px}
.steps{display:flex;gap:10px;margin:16px 0 4px;font-size:14px;color:#f1ecff}
.steps span{padding:6px 12px;border:1px solid rgba(243,220,161,.5);border-radius:999px}
.row{margin-top:34px}
.row h2{font-family:"Noto Serif KR",serif;font-size:27px;color:#f3dca1;display:flex;align-items:baseline;gap:12px}
.row h2 .n{min-width:52px;color:#e9c46f}
.row h2 small{font-family:"Noto Sans KR";font-size:14px;color:#9d93d0;font-weight:400}
.kept{margin:6px 0 14px;font-size:14.5px;color:#cfc7f3}
.tiles{display:flex;align-items:flex-start}
.tile{width:320px;flex:none}
.card{width:320px;aspect-ratio:600/1040;border-radius:21px;overflow:hidden;background:#efe6d2;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 12px 26px rgba(5,3,15,.55)}
.card img{display:block;width:100%;height:100%;object-fit:cover}
.card.old{opacity:.8}
.cap{margin-top:10px;font-size:15px;font-weight:700;line-height:1.4}
.cap em{display:block;font-style:normal;font-weight:400;color:#a79ddb;font-size:13px}
.arrow{width:46px;flex:none;align-self:center;text-align:center;font-size:30px;color:#e9c46f;margin-top:-90px}
.gap{width:26px;flex:none}
h3{margin:44px 0 12px;font-family:"Noto Serif KR",serif;font-size:23px;color:#f3dca1}
.note{font-size:14px;color:#a79ddb;margin-bottom:14px;line-height:1.6;max-width:1500px}
.g90s{display:flex;gap:46px}
.g90 .imgs{display:flex;gap:8px}
.s90{width:90px;height:156px;border-radius:7px;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 6px 12px rgba(5,3,15,.5);object-fit:cover;background:#efe6d2}
.g90 .lbl{margin:6px 0 14px;font-size:12px;color:#a79ddb}
.tests{display:flex;gap:36px}
.tcol{width:560px}
.tcol h4{font-size:17px;color:#f3dca1;margin-bottom:8px}
.blind{width:200px;border-radius:14px;box-shadow:0 0 0 1px rgba(243,220,161,.55);display:block}
.guess{margin:10px 0;font-size:13.5px;color:#e5def9;line-height:1.55}
table{border-collapse:collapse;font-size:12.5px;width:100%}
th,td{padding:3px 8px;text-align:left;border-bottom:1px solid rgba(243,220,161,.15)}
th{color:#a79ddb;font-weight:500}
tr.PASS td:last-child{color:#7fe0ae}tr.WARN td:last-child{color:#ffd37a}tr.FAIL td:last-child{color:#ff8a98}tr.info td{color:#9d93d0}
.ask{margin-top:36px;padding:18px 22px;border:1px solid rgba(243,220,161,.55);border-radius:14px;font-size:16px;line-height:1.7;background:rgba(21,17,58,.6);max-width:1500px}
.ask b{color:#f3dca1}
</style><body>
<h1>스타로그 카드 프로토타입 v2 · 원본 → 단순화 → 캐릭터화</h1>
<p class="sub">소유자 피드백(캐릭터가 너무 크고 배경이 복잡해 이름을 바로 맞히기 어렵다)을 반영해 방향을 바꿨다. 각 카드는 1909 스캔의 구도·포즈를 그대로 두고, 평면 도형으로 단순화한 뒤, 같은 관절 위치에 고양이·토끼를 세운다.</p>
<div class="steps"><span>① 원본: 1909 스캔의 구도</span><span>② 단순화: 필수 상징만 크게</span><span>③ 캐릭터화: 같은 포즈의 고양이·토끼</span><span>프레임 A: 번호+이름 / B: A+키워드</span></div>
${rows()}
<h3>90px 가독성 (앱 부채꼴 폭)</h3>
<p class="note">실제 크기 90px 타일. 왼쪽부터 이전 v1 · 원본 · 단순화 · 프레임 A · 프레임 B. 아래 줄은 ③A를 같은 크기로 줄이고 흐리게 본 모습(squint)이다. 실루엣과 큰 상징이 남는지 본다.</p>
${row90()}
<h3>자가 테스트 (STYLE.md 5절)</h3>
<p class="note">왼쪽 그림은 번호·이름 판을 뺀 카드(이름 맞히기용). 아래 표는 상징을 하나씩 숨겼을 때 90px에서 차이가 나는 영역의 크기와 밝기 대비다. 이름 맞히기는 작성자가 직접 본 판정이라 편향이 있다. 타로를 아는 사람 3명에게 라벨 없이 보여 주는 맹검이 필요하다.</p>
${tests()}
<div class="ask"><b>골라 주세요</b> 프레임 <b>A</b>(번호 + 이름)와 <b>B</b>(번호 + 이름 + 키워드 한 줄). 키워드는 KB keywordsKo에서 그대로 가져왔다: 바보 "새 출발", 마법사 "의지와 실행", 별 "조용한 회복". 고르면 batch 1(II 여사제 ~ VI 연인)을 이 방식으로 이어서 만든다.</div>
</body></html>`;

const file = path.join(OUT, "prototype-v2.html");
await writeFile(file, html);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url(file));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);
await mkdir(path.join(ROOT, "review"), { recursive: true });
await page.screenshot({ path: path.join(ROOT, "review", "prototype-v2.png"), fullPage: true });
await browser.close();
console.log("review/prototype-v2.png");
