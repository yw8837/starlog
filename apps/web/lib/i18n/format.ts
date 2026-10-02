import { withParticle, type Particle } from "@/lib/korean";
import { LOCALE_INFO, type Locale } from "./locales";

/**
 * ICU-lite (spec §5.1): `{name}`, `{n, plural, =0 {…} one {…} other {…}}` with `#` for the count, and
 * `{name, josa, 을/를}` (Korean only). Numbers get the locale's digit grouping, so pass years and ids as
 * strings. Pure; safe on server and client.
 */

export type MessageValues = Readonly<Record<string, string | number>>;

export type MessageNode =
  | { kind: "text"; text: string }
  | { kind: "arg"; name: string }
  | { kind: "josa"; name: string; pair: Particle }
  | { kind: "plural"; name: string; cases: Readonly<Record<string, MessageNode[]>> };

export class MessageSyntaxError extends Error {
  override name = "MessageSyntaxError";
}

const PARTICLES: readonly string[] = ["을/를", "은/는", "이/가", "과/와"];
const NAME = /^[A-Za-z_]\w*$/;
const PLURAL_KEY = /^(=\d+|zero|one|two|few|many|other)$/;
const parsed = new Map<string, MessageNode[]>();

export function parseMessage(source: string): MessageNode[] {
  const hit = parsed.get(source);
  if (hit) return hit;
  let i = 0;
  const fail = (why: string): never => {
    throw new MessageSyntaxError(`${why} at ${i} in "${source}"`);
  };
  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i]!)) i++;
  };
  const readUntil = (stops: string): string => {
    const start = i;
    while (i < source.length && !stops.includes(source[i]!)) i++;
    return source.slice(start, i).trim();
  };
  const expect = (ch: string) => {
    if (source[i] !== ch) fail(`expected "${ch}"`);
    i++;
  };

  function sequence(inCase: boolean): MessageNode[] {
    const out: MessageNode[] = [];
    let text = "";
    while (i < source.length) {
      const ch = source[i]!;
      if (ch === "}") {
        if (inCase) break;
        fail("unmatched }");
      }
      if (ch === "{") {
        if (text) out.push({ kind: "text", text });
        text = "";
        out.push(placeholder());
        continue;
      }
      text += ch;
      i++;
    }
    if (text) out.push({ kind: "text", text });
    return out;
  }

  function placeholder(): MessageNode {
    expect("{");
    const name = readUntil(",}");
    if (!NAME.test(name)) fail(`bad argument name "${name}"`);
    if (source[i] === "}") {
      i++;
      return { kind: "arg", name };
    }
    expect(",");
    const type = readUntil(",}");
    expect(",");
    if (type === "josa") {
      const pair = readUntil("}");
      if (!PARTICLES.includes(pair)) fail(`unknown josa pair "${pair}"`);
      expect("}");
      return { kind: "josa", name, pair: pair as Particle };
    }
    if (type === "plural") {
      const cases: Record<string, MessageNode[]> = {};
      for (;;) {
        skipSpace();
        if (i >= source.length) fail("unterminated plural");
        if (source[i] === "}") {
          i++;
          break;
        }
        const key = readUntil("{");
        if (!PLURAL_KEY.test(key)) fail(`bad plural case "${key}"`);
        expect("{");
        cases[key] = sequence(true);
        expect("}");
      }
      if (!cases.other) fail("plural without other");
      return { kind: "plural", name, cases };
    }
    return fail(`unknown type "${type}"`);
  }

  const nodes = sequence(false);
  parsed.set(source, nodes);
  return nodes;
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();

function plural(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(LOCALE_INFO[locale].intl)));
  return rules;
}

function numbers(locale: Locale): Intl.NumberFormat {
  let format = numberFormats.get(locale);
  if (!format) numberFormats.set(locale, (format = new Intl.NumberFormat(LOCALE_INFO[locale].intl)));
  return format;
}

function valueOf(values: MessageValues, name: string, source: string): string | number {
  const value = values[name];
  if (value !== undefined) return value;
  if (process.env.NODE_ENV !== "production") throw new MessageSyntaxError(`missing value "${name}" for "${source}"`);
  return "";
}

function render(nodes: readonly MessageNode[], values: MessageValues, locale: Locale, source: string, hash?: string): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += hash === undefined ? node.text : node.text.replaceAll("#", hash);
    } else if (node.kind === "arg") {
      const value = valueOf(values, node.name, source);
      out += typeof value === "number" ? numbers(locale).format(value) : value;
    } else if (node.kind === "josa") {
      const word = String(valueOf(values, node.name, source));
      out += locale === "ko" ? withParticle(word, node.pair) : word;
    } else {
      const n = Number(valueOf(values, node.name, source));
      const branch = node.cases[`=${n}`] ?? node.cases[plural(locale).select(n)] ?? node.cases.other!;
      out += render(branch, values, locale, source, numbers(locale).format(n));
    }
  }
  return out;
}

export function formatMessage(source: string, values: MessageValues = {}, locale: Locale = "ko"): string {
  return render(parseMessage(source), values, locale, source);
}

export function argumentNames(nodes: readonly MessageNode[]): string[] {
  const names = new Set<string>();
  const visit = (list: readonly MessageNode[]) => {
    for (const node of list) {
      if (node.kind === "text") continue;
      names.add(node.name);
      if (node.kind === "plural") Object.values(node.cases).forEach(visit);
    }
  };
  visit(nodes);
  return [...names].sort();
}

export function hasJosa(nodes: readonly MessageNode[]): boolean {
  return nodes.some((node) => node.kind === "josa" || (node.kind === "plural" && Object.values(node.cases).some(hasJosa)));
}
