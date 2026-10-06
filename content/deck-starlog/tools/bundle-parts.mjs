// Bundles the app's REAL character parts (apps/web/components/characters) into one ESM file so the
// deck generator can render them to static SVG markup with react-dom/server.
//
// Nothing in apps/web is edited: the private helpers we need (hat, cape, glasses, book ...) are
// exported by an in-memory patch at bundle time, and the CSS-module import is stubbed (no CSS,
// no animation -> static art). Re-run after any character tweak and the deck follows.
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("D:/Money/apps/saju-tarot/apps/web/package.json");
const esbuild = require("esbuild");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = "D:/Money/apps/saju-tarot/apps/web";
const CH = `${WEB}/components/characters`;

// Private (non-exported) helpers we reuse verbatim.
const PRIVATE = {
  "CatTarot.tsx": ["Cape", "AstrologerHat", "CrystalBall"],
  "RabbitTarot.tsx": ["Pencil", "Glasses", "Bow", "CardiganArm", "OpenBook", "Quill"],
};

const exportPrivates = {
  name: "export-privates-and-stub-css",
  setup(build) {
    build.onLoad({ filter: /[\\/]components[\\/]characters[\\/](CatTarot|RabbitTarot)\.tsx$/ }, async (args) => {
      const src = await readFile(args.path, "utf8");
      const names = PRIVATE[path.basename(args.path)];
      return { contents: `${src}\nexport { ${names.join(", ")} };\n`, loader: "tsx", resolveDir: path.dirname(args.path) };
    });
    // CSS modules only drive animation; static art gets the class name and no style.
    build.onLoad({ filter: /\.module\.css$/ }, () => ({
      contents: 'export default new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : undefined) });',
      loader: "js",
    }));
  },
};

const entry = `
export * from "${CH}/CatParts.tsx";
export * from "${CH}/RabbitParts.tsx";
export { Face } from "${CH}/Face.tsx";
export * from "${CH}/parts/silhouettes.ts";
export { Rim } from "${CH}/parts/Rim.tsx";
export { Sleeve } from "${CH}/parts/Sleeve.tsx";
export { sparklePath, starPath } from "${CH}/shapes.ts";
export { CharacterDefs } from "${CH}/defs.tsx";
export { Cape, AstrologerHat, CrystalBall, CatTarot } from "${CH}/CatTarot.tsx";
export { Pencil, Glasses, Bow, CardiganArm, OpenBook, Quill, RabbitTarot } from "${CH}/RabbitTarot.tsx";
`;

export async function bundleParts() {
  const outfile = path.join(HERE, ".build", "parts.mjs");
  await mkdir(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    stdin: { contents: entry, resolveDir: WEB, loader: "ts", sourcefile: "deck-parts-entry.ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    jsx: "automatic",
    external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server"],
    plugins: [exportPrivates],
    logLevel: "warning",
  });
  return outfile;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const out = await bundleParts();
  console.log("bundled ->", out);
}
