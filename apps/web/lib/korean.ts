/**
 * Korean particles that depend on the word before them (을/를, 은/는, 이/가, 와/과). Pure; safe on
 * both server and client.
 */

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;

/**
 * True when the word's last syllable has a final consonant (받침), false when it ends in a vowel,
 * null when the last character is not a Hangul syllable (Latin letters, digits, symbols), where the
 * right particle cannot be told from spelling alone.
 */
export function hasFinalConsonant(word: string): boolean | null {
  const trimmed = word.trim();
  const last = trimmed[trimmed.length - 1];
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return null;
  return (code - HANGUL_FIRST) % 28 !== 0;
}

const PAIRS = {
  "을/를": ["을", "를"],
  "은/는": ["은", "는"],
  "이/가": ["이", "가"],
  "과/와": ["과", "와"],
} as const;

export type Particle = keyof typeof PAIRS;

/** The particle that follows `word`, or null when the word does not end in a Hangul syllable. */
export function particle(word: string, pair: Particle): string | null {
  const final = hasFinalConsonant(word);
  if (final === null) return null;
  return PAIRS[pair][final ? 0 : 1];
}

/** `word` + its particle. Only for known Hangul words: a non-Hangul ending gets the consonant form. */
export function withParticle(word: string, pair: Particle): string {
  return `${word}${particle(word, pair) ?? PAIRS[pair][0]}`;
}
