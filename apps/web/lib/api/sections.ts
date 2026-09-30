/**
 * Tolerant scan of a growing JSON text (the model's structured output as it streams) for the
 * top-level keys that have started, so the UI can show which part is being written. It never
 * returns any text: only `{key, index}`, with one event per element for array values
 * (`cards`, `sections`) and index 0 for everything else.
 */

export interface SectionEvent {
  key: string;
  index: number;
}

export class SectionScanner {
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private stringIsKey = false;
  private buffer = "";
  /** at depth 1: true right after `{` or `,`, where a key starts */
  private expectKey = false;
  /** the top-level key whose value has not started yet */
  private pendingKey: string | null = null;
  /** the top-level key whose value is an array, and its next element index */
  private arrayKey: string | null = null;
  private arrayIndex = 0;
  /** inside that array, at depth 2: true right after `[` or `,` */
  private expectElement = false;
  private readonly seen = new Set<string>();

  /** Feed the full text so far; returns the events for what is new since the last call. */
  push(snapshot: string): SectionEvent[] {
    if (snapshot.length < this.pos) this.reset(); // a new attempt started over
    const out: SectionEvent[] = [];
    for (; this.pos < snapshot.length; this.pos++) this.step(snapshot[this.pos]!, out);
    return out;
  }

  /** Forget everything (the regeneration writes from the start again). */
  reset(): void {
    this.pos = 0;
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.stringIsKey = false;
    this.buffer = "";
    this.expectKey = false;
    this.pendingKey = null;
    this.arrayKey = null;
    this.arrayIndex = 0;
    this.expectElement = false;
    this.seen.clear();
  }

  private emit(key: string, index: number, out: SectionEvent[]): void {
    const id = `${key}#${index}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    out.push({ key, index });
  }

  private step(ch: string, out: SectionEvent[]): void {
    if (this.inString) {
      if (this.escaped) {
        this.escaped = false;
        if (this.stringIsKey) this.buffer += ch;
      } else if (ch === "\\") {
        this.escaped = true;
      } else if (ch === '"') {
        this.inString = false;
        if (this.stringIsKey) {
          this.pendingKey = this.buffer;
          this.stringIsKey = false;
        }
      } else if (this.stringIsKey) {
        this.buffer += ch;
      }
      return;
    }
    if (/\s/.test(ch)) return;

    // The first character of a top-level value decides: array → per element, else → the key itself.
    if (this.pendingKey !== null && ch !== ":") {
      const key = this.pendingKey;
      this.pendingKey = null;
      if (ch === "[") {
        this.arrayKey = key;
        this.arrayIndex = 0;
        this.expectElement = true;
        this.depth++;
        return;
      }
      this.emit(key, 0, out);
    }

    // An element of the top-level array starts.
    if (this.arrayKey !== null && this.depth === 2 && this.expectElement && ch !== "]") {
      this.emit(this.arrayKey, this.arrayIndex++, out);
      this.expectElement = false;
    }

    switch (ch) {
      case '"':
        this.inString = true;
        this.stringIsKey = this.depth === 1 && this.expectKey;
        this.buffer = "";
        if (this.depth === 1) this.expectKey = false;
        break;
      case "{":
      case "[":
        this.depth++;
        if (this.depth === 1) this.expectKey = true;
        break;
      case "}":
      case "]":
        this.depth--;
        if (this.depth === 1) {
          this.arrayKey = null;
          this.expectElement = false;
        }
        break;
      case ",":
        if (this.depth === 1) this.expectKey = true;
        if (this.depth === 2 && this.arrayKey !== null) this.expectElement = true;
        break;
      default:
        break;
    }
  }
}
