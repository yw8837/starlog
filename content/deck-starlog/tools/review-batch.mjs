// Batch review sheet.   node review-batch.mjs batch-01      (run selftest.mjs for all cards first)
// -> review/batch-01.png: the v2 fixes (before -> after), per card 1 original -> 2 simplified -> 3 character (frame B),
//    symbols kept and changed, self-test numbers, the 90 px rows (+ squint), the label-free images and the card back.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { launch } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SCANS = "D:/Money/apps/saju-tarot/apps/web/public/cards";
const url = (p) => `file:///${p.replace(/\\/g, "/")}`;
const deck = JSON.parse(readFileSync(path.join(ROOT, "deck.json"), "utf8"));
const selftest = JSON.parse(readFileSync(path.join(ROOT, "review", "selftest.json"), "utf8")).results;
const meta = (id) => deck.cards.find((c) => c.id === id);

const BATCHES = {
  "batch-01": {
    title: "배치 1 · II 여사제 ~ VI 연인",
    ids: ["major-02-high-priestess", "major-03-empress", "major-04-emperor", "major-05-hierophant", "major-06-lovers"],
    notes: {
      "major-02-high-priestess": {
        kept: "검은 기둥(B)과 흰 기둥(J) 사이에 정면으로 앉은 인물, 석류 휘장, 뿔 달린 달 관, 푸른 망토와 흰 가운, 가슴의 흰 십자, 무릎 위 두루마리, 발치의 초승달.",
        changed: "인물 → 사서 토끼(가디건 위에 망토). 두루마리의 글자(TORA)는 쓰지 않고 별 표시로. 기둥의 B·J 글자도 뺐다.",
        blind: "검은·흰 기둥 사이 정면 착석, 석류 휘장, 두루마리, 발치 초승달 → 여사제. 확신 높음.",
      },
      "major-03-empress": {
        kept: "쿠션에 기대어 약간 오른쪽에 앉은 자세, 별 관, 구슬 달린 홀(왼손), 금성 기호 하트 방패(왼쪽 아래), 앞의 밀밭, 뒤의 숲과 폭포, 석류 무늬 가운.",
        changed: "인물 → 사서 토끼. 별 12개는 90px에서 셀 수 없어 5개로. 석류 무늬는 큰 점 5개로.",
        blind: "별 관, 구슬 홀, 하트 방패의 금성 기호, 밀밭 → 여황제. 확신 높음.",
      },
      "major-04-emperor": {
        kept: "정면 대칭, 숫양 머리 돌 옥좌(등받이 모서리와 팔걸이), 왼손의 앙크 홀, 오른손의 구슬, 금관, 붉은 옷과 갑옷 다리, 헐벗은 주황 산과 주황 하늘.",
        changed: "인물 → 점성술사 고양이. 긴 흰 수염은 가슴의 흰 털로, 금관은 모자의 금띠로.",
        blind: "숫양 머리 돌 옥좌, 앙크 홀과 구슬, 붉은 옷, 주황 산 → 황제. 확신 높음.",
      },
      "major-05-hierophant": {
        kept: "두 회색 기둥 사이 정면 착석, 삼중관과 늘어진 띠, 붉은 예복과 십자 흰 띠, 오른손의 축복(두 손가락), 왼손의 삼중 십자 지팡이, 교차한 열쇠, 아래 모서리의 무릎 꿇은 둘.",
        changed: "인물 → 고양이. 삼중관 = 모자의 금띠 3겹. 수도자 둘 = 털색을 바꾼 새끼 고양이(회색·검정, 모자 없음), 등을 보이는 대신 정면.",
        blind: "삼중관, 축복의 두 손가락, 삼중 십자 지팡이, 교차한 열쇠, 무릎 꿇은 둘 → 교황. 확신 높음.",
      },
      "major-06-lovers": {
        kept: "맨 위의 큰 해, 붉은 날개를 펼친 천사와 구름, 떨어져 선 두 사람(왼쪽은 천사를 올려다보고 오른쪽은 왼쪽을 본다), 뱀 감긴 열매 나무, 불꽃 나무, 가운데 산.",
        changed: "여자 → 사서 토끼, 남자 → 점성술사 고양이, 천사 → 날개 달린 흰 토끼(안경·리본·연필 없음, 금 후광). 알몸 → 각자의 평소 옷.",
        blind: "큰 해와 붉은 날개 천사, 떨어져 선 두 인물, 두 나무, 가운데 산 → 연인. 확신 높음.",
      },
    },
  },
};

const name = process.argv[2] ?? "batch-01";
const B = BATCHES[name];
const ALL = ["major-00-fool", "major-01-magician", ...B.ids, "major-17-star"];

const card = (src, cls = "", w = 300) => `<div class="card ${cls}" style="width:${w}px"><img src="${url(src)}"></div>`;
const tile = (src, cap, sub, w) => `<div class="tile" style="width:${w}px">${card(src, "", w)}<div class="cap">${cap}<em>${sub}</em></div></div>`;

const fix = `
  <section><h3>v2 수정 확인 (코디네이터 요청 2건)</h3>
  <div class="tiles">
    ${tile(path.join(HERE, ".build", "before", "major-17-star.png"), "별 · 수정 전", "배로 미끄러지듯 퍼져 있었다", 220)}
    ${tile(path.join(ROOT, "stages", "major-17-star", "3-character-B.png"), "별 · 수정 후", "한 무릎은 땅에, 한 발은 연못에, 항아리 둘을 낮게", 220)}
    <div class="gap"></div>
    ${tile(path.join(HERE, ".build", "before", "major-00-fool.png"), "바보 · 수정 전", "남색 상자·소파처럼 보였다", 220)}
    ${tile(path.join(ROOT, "stages", "major-00-fool", "3-character-B.png"), "바보 · 수정 후", "바위 절벽: 튀어나온 입술, 그늘진 홈, 굴러떨어지는 돌", 220)}
  </div></section>`;

const rows = B.ids
  .map((id) => {
    const m = meta(id);
    const st = path.join(ROOT, "stages", id);
    const n = B.notes[id];
    const t = selftest[id].symbols;
    const lines = t.map((s) => `<tr class="${s.verdict}"><td>${s.symbol}</td><td>${s.rank}</td><td>${s.bbox90}</td><td>${s.dL}</td><td>${s.verdict}</td></tr>`).join("");
    const bad = t.filter((s) => s.verdict === "FAIL" || s.verdict === "WARN").length;
    return `<section class="row">
      <h2><span class="n">${m.numeral}</span>${m.ko}<small>${m.en} · 키워드 "${m.keyword}"</small></h2>
      <div class="tiles">
        ${tile(path.join(st, "1-original.webp"), "① 원본", "1909 스캔", 280)}<div class="arrow">→</div>
        ${tile(path.join(st, "2-simplified.png"), "② 단순화", "필수 상징만 크게, 평면", 280)}<div class="arrow">→</div>
        ${tile(path.join(st, "3-character-B.png"), "③ 캐릭터화 · 프레임 B", "고양이·토끼가 같은 자리에서 연기", 380)}
        <div class="text">
          <p><b>남긴 것</b> ${n.kept}</p>
          <p><b>바꾼 것</b> ${n.changed}</p>
          <p><b>이름 맞히기(작성자 자가 판정)</b> ${n.blind}</p>
          <table><tr><th>상징(90px)</th><th>순위</th><th>크기 px</th><th>ΔL</th><th>${bad ? "확인 필요" : "통과"}</th></tr>${lines}</table>
        </div>
      </div></section>`;
  })
  .join("");

const sm = (src, rot = false) => `<img class="s90" src="${url(src)}"${rot ? ' style="transform:rotate(180deg)"' : ""}>`;
const row90 = (label, srcs) => `<div class="r90"><div class="lbl">${label}</div><div class="imgs">${srcs.map((s) => sm(s)).join("")}</div></div>`;
const labels = ALL.map((id) => `<span>${meta(id).numeral}</span>`).join("");

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{background:radial-gradient(1500px 800px at 50% -8%,#2e2a78 0%,#15113a 55%,#0d0a26 100%);color:#f1ecff;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;padding:44px 52px 56px;width:1900px}
h1{font-family:"Noto Serif KR",serif;font-size:34px;color:#f3dca1}
.sub{margin-top:8px;font-size:16px;color:#bdb3e6;line-height:1.6;max-width:1600px}
h3{margin:40px 0 12px;font-family:"Noto Serif KR",serif;font-size:23px;color:#f3dca1}
.row{margin-top:38px}
.row h2{font-family:"Noto Serif KR",serif;font-size:27px;color:#f3dca1;display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
.row h2 .n{min-width:60px;color:#e9c46f}.row h2 small{font-family:"Noto Sans KR";font-size:14px;color:#9d93d0;font-weight:400}
.tiles{display:flex;align-items:flex-start}
.card{aspect-ratio:600/1040;border-radius:20px;overflow:hidden;background:#efe6d2;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 12px 26px rgba(5,3,15,.55)}
.card img{display:block;width:100%;height:100%;object-fit:cover}
.cap{margin-top:10px;font-size:15px;font-weight:700;line-height:1.4}.cap em{display:block;font-style:normal;font-weight:400;color:#a79ddb;font-size:13px}
.arrow{width:40px;flex:none;align-self:center;text-align:center;font-size:28px;color:#e9c46f;margin-top:-80px}
.gap{width:50px;flex:none}
.text{flex:1;margin-left:34px;font-size:14px;line-height:1.6;color:#e5def9;min-width:0}
.text p{margin-bottom:8px}.text b{display:block;color:#f3dca1;font-size:13px;letter-spacing:.02em}
table{border-collapse:collapse;font-size:12px;width:100%;margin-top:6px}
th,td{padding:2px 8px;text-align:left;border-bottom:1px solid rgba(243,220,161,.15)}th{color:#a79ddb;font-weight:500}
tr.PASS td:last-child{color:#7fe0ae}tr.WARN td:last-child{color:#ffd37a}tr.FAIL td:last-child{color:#ff8a98}tr.info td{color:#9d93d0}
.note{font-size:14px;color:#a79ddb;margin-bottom:12px;line-height:1.6;max-width:1500px}
.r90{margin-bottom:14px}.r90 .lbl{font-size:12px;color:#a79ddb;margin-bottom:5px}.r90 .imgs{display:flex;gap:8px}
.s90{width:90px;height:156px;border-radius:7px;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 6px 12px rgba(5,3,15,.5);object-fit:cover;background:#efe6d2}
.nums{display:flex;gap:8px;font-size:12px;color:#e9c46f;margin-bottom:4px}.nums span{width:90px;text-align:center}
.blind{display:flex;gap:10px}.blind img{width:150px;border-radius:12px;box-shadow:0 0 0 1px rgba(243,220,161,.55)}
.backrow{display:flex;gap:30px;align-items:flex-end}
</style><body>
<h1>스타로그 카드 · ${B.title}</h1>
<p class="sub">소유자 결정: 프레임 B(번호 + 이름 + 키워드). 조연 규칙 승인(천사 = 날개 달린 흰 토끼, 악마 쪽 = 박쥐 날개 검은 고양이, 죽음의 해골은 XIII에서 선택지를 보여 준다). 카드마다 ① 1909 원본 → ② 단순화 → ③ 캐릭터화를 파일로 남겼고, 키워드는 KB keywordsKo에서 그대로 가져왔다(22장 모두 일치 확인).</p>
${fix}
${rows}
<h3>90px 가독성 (앱 부채꼴 폭)</h3>
<p class="note">위부터 스타로그 ③, 1909 원본, ③을 90px로 줄이고 흐리게 본 모습(squint). 같은 규격으로 이미 만든 0·I·XVII를 같이 놓아 덱의 일관성을 본다.</p>
<div class="nums">${labels}</div>
${row90("스타로그 (프레임 B)", ALL.map((id) => path.join(ROOT, "render", `${id}-sm.webp`)))}
${row90("1909 원본", ALL.map((id) => `${SCANS}/${id}-sm.webp`))}
${row90("squint", ALL.map((id) => path.join(HERE, ".build", "selftest", `${id}-squint.png`)))}
<h3>이름 맞히기용 이미지 (번호·이름 판 없음)</h3>
<p class="note">review/blind/ 의 파일. 타로를 아는 사람 3명에게 순서를 섞어 보여 주고 5초 안에 이름을 묻는다(STYLE.md 5.2). 위 "작성자 자가 판정"은 편향이 있어 합격 근거가 아니다.</p>
<div class="blind">${ALL.map((id) => `<img src="${url(path.join(ROOT, "review", "blind", `${id}.png`))}">`).join("")}</div>
<h3>카드 뒷면</h3>
<div class="backrow">
  ${tile(path.join(ROOT, "render", "back@3x.webp"), "스타로그 뒷면", "점대칭: 180° 돌려도 같다", 280)}
  <div>${sm(path.join(ROOT, "render", "back-sm.webp"))}${sm(path.join(ROOT, "render", "back-sm.webp"), true)}<div class="note" style="margin-top:8px">90px, 그리고 180° 돌린 모습</div></div>
</div>
</body></html>`;

await mkdir(path.join(HERE, ".build"), { recursive: true });
const file = path.join(HERE, ".build", `${name}.html`);
await writeFile(file, html);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1900, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url(file));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(ROOT, "review", `${name}.png`), fullPage: true });
await browser.close();
console.log(`review/${name}.png`);
