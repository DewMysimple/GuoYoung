import { pinyin } from "pinyin-pro";

type SearchText = { text: string; compact: string; syllables: string[]; initials: string };
const cache = new Map<string, SearchText>();
const compact = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/ü/g, "v")
  .normalize("NFD").replace(/\p{M}/gu, "").trim();

function indexText(value: string): SearchText {
  const cached = cache.get(value);
  if (cached) return cached;
  const text = normalize(value);
  // Split English words before lowercasing so both Stack Overflow and GitHub have initials.
  const words = value.replace(/([a-z])([A-Z])/g, "$1 $2");
  const syllables = pinyin(words, { toneType: "none", type: "array", nonZh: "consecutive", v: true })
    .flatMap(part => normalize(part).split(/[^\p{L}\p{N}]+/u)).filter(Boolean);
  const result = { text, compact: compact(text), syllables, initials: syllables.map(part => part[0]).join("") };
  if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
  cache.set(value, result);
  return result;
}

// Accept contiguous syllable prefixes: wysj / wangyesj / wangyesheji.
function matchesSyllables(parts: string[], query: string): boolean {
  for (let start = 0; start < parts.length; start++) {
    let offsets = new Set([0]);
    for (let i = start; i < parts.length && offsets.size; i++) {
      const next = new Set<number>();
      for (const offset of offsets) {
        for (let length = 1; length <= Math.min(parts[i].length, query.length - offset); length++) {
          if (parts[i].slice(0, length) !== query.slice(offset, offset + length)) break;
          if (offset + length === query.length) return true;
          next.add(offset + length);
        }
      }
      offsets = next;
    }
  }
  return false;
}

function textScore(value: string, query: string): number {
  if (!value) return 0;
  const field = indexText(value);
  if (field.text === query) return 120;
  if (field.text.startsWith(query)) return 105;
  if (field.text.includes(query)) return 90;
  const key = compact(query);
  if (!key) return 0;
  if (field.compact === key) return 115;
  if (field.compact.startsWith(key)) return 100;
  if (field.compact.includes(key)) return 85;
  // A lone Latin initial is too broad to guess Chinese names usefully.
  if (!/^[a-z\d]{2,}$/u.test(key)) return 0;
  const full = field.syllables.join("");
  if (full === key) return 80;
  if (full.startsWith(key)) return 75;
  if (field.initials === key) return 70;
  if (field.initials.startsWith(key)) return 65;
  if (matchesSyllables(field.syllables, key)) return 55;
  // Common Latin contractions (km → Kimi, gthb → GitHub) are lower confidence.
  if (/^[a-z\s]+$/.test(field.text) && field.compact.replace(/[aeiou]/g, "").startsWith(key)) return 40;
  return 0;
}

/** Local relevance only. No remote suggestions or persisted search index. */
export function collectionSearchScore(name: string, url: string, group: string, input: string): number {
  const query = normalize(input);
  if (!query) return 0;
  const scoreTerm = (term: string) => Math.max(textScore(name, term),
    Math.max(0, textScore(url, term) - 30), Math.max(0, textScore(group, term) - 40));
  const whole = scoreTerm(query);
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length < 2) return whole;
  const scores = terms.map(scoreTerm);
  return Math.max(whole, scores.every(Boolean) ? scores.reduce((a, b) => a + b, 0) / scores.length : 0);
}
