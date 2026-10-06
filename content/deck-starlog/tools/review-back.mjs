// review/card-back.png: the current back.svg next to the Starlog back, the Starlog back turned 180 degrees (identical), and 90 px sizes.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const url = (p) => `file:///${p.replace(/\\/g, "/")}`;
const OLD = "D:/Money/apps/saju-tarot/apps/web/public/cards/back.svg";
const NEW = path.join(ROOT, "render", "back@3x.webp");
const fronts = ["major-00-fool", "major-01-magician", "major-17-star"].map((id) => path.join(ROOT, "render", `${id}-sm.webp`));

const big = (src, cap, sub, rot = false) => `<div class="t"><div class="c"><img src="${url(src)}" ${rot ? 'style="transform:rotate(180deg)"' : ""}></div><div class="cap">${cap}<em>${sub}</em></div></div>`;
const small = (src, rot = false) => `<div class="s"><img src="${url(src)}" ${rot ? 'style="transform:rotate(180deg)"' : ""}></div>`;

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{background:radial-gradient(1200px 700px at 50% -10%,#2e2a78 0%,#15113a 55%,#0d0a26 100%);color:#f1ecff;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;padding:40px 48px 46px;width:1240px}
h1{font-family:"Noto Serif KR",serif;font-size:30px;color:#f3dca1}
p.n{margin:8px 0 22px;font-size:15px;color:#bdb3e6;line-height:1.6;max-width:1100px}
.row{display:flex;gap:44px}
.c{width:330px;aspect-ratio:600/1040;border-radius:22px;overflow:hidden;background:#15113a;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 12px 26px rgba(5,3,15,.55)}
.c img{display:block;width:100%;height:100%;object-fit:cover}
.cap{margin-top:10px;font-size:15px;font-weight:700}.cap em{display:block;font-style:normal;font-weight:400;font-size:13px;color:#a79ddb}
h3{margin:34px 0 10px;font-family:"Noto Serif KR",serif;font-size:21px;color:#f3dca1}
.srow{display:flex;gap:10px}
.s{width:90px;height:156px;border-radius:7px;overflow:hidden;box-shadow:0 0 0 1px rgba(243,220,161,.55),0 6px 12px rgba(5,3,15,.5)}
.s img{display:block;width:100%;height:100%;object-fit:cover}
</style><body>
<h1>스타로그 카드 뒷면</h1>
<p class="n">달·별·로고 별(오각별)과 별 카드의 팔각 별로 만든 뒷면. 위쪽 그림을 한 번 그리고 180° 돌려 한 번 더 그려서 점대칭이다. 역방향으로 뽑힌 카드를 뒤집기 전에 뒷면만 봐서는 위아래를 알 수 없다.</p>
<div class="row">
${big(OLD, "지금 앱의 back.svg", "초승달 + 팔각 별, 위아래가 있다")}
${big(NEW, "스타로그 뒷면", "점대칭, 3mm 도련·4.2mm 금테(PRINT.md)")}
${big(NEW, "스타로그 뒷면 180° 회전", "똑같다 (3배 렌더 5,616,000픽셀 중 94개만 가장자리 차이)", true)}
</div>
<h3>90px 부채꼴 크기</h3>
<div class="srow">${small(OLD)}${small(NEW)}${small(NEW, true)}<div style="width:30px"></div>${fronts.map((f) => small(f)).join("")}</div>
</body></html>`;

await mkdir(path.join(HERE, ".build"), { recursive: true });
const file = path.join(HERE, ".build", "card-back.html");
await writeFile(file, html);
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url(file));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(ROOT, "review", "card-back.png"), fullPage: true });
await browser.close();
console.log("review/card-back.png");
