/** Small, fast scorer: every query term must match title or URL. Returns 0 for no match. */
export function score(terms: string[], title: string, url = ''): number {
  if (!terms.length) return 0;
  const t = title.toLowerCase();
  const u = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
  let total = 0;
  for (const term of terms) {
    const s = Math.max(termScore(term, t), termScore(term, u) * 0.75);
    if (s === 0) return 0;
    total += s;
  }
  return total / terms.length;
}

function termScore(term: string, text: string): number {
  if (!text) return 0;
  const i = text.indexOf(term);
  if (i === 0) return 1;
  if (i > 0) {
    const prev = text[i - 1];
    return /[\s\-_/.:|·—(]/.test(prev) ? 0.9 : 0.6 - Math.min(i, 40) / 200;
  }
  // Subsequence fallback (e.g. "gml" → "gmail"), only for short terms.
  if (term.length > 6) return 0;
  let j = 0;
  for (let k = 0; k < text.length && j < term.length; k++) if (text[k] === term[j]) j++;
  return j === term.length ? 0.25 : 0;
}

export function terms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}
