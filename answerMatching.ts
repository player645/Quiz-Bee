/**
 * Normalization carried over unchanged from the original quiz:
 * lower-case, strip accents, "&" -> "and", drop . , ' " ` ( ), hyphens/underscores
 * become spaces, collapse whitespace, drop a leading "the".
 *
 * There is intentionally NO fuzzy matching. An answer is correct only if its
 * normalized form equals the normalized form of an accepted answer.
 */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.,'"`()]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '')
}

export function isAcceptedAnswer(input: string, accepted: readonly string[]): boolean {
  const n = normalizeAnswer(input)
  if (!n) return false
  return accepted.some((a) => normalizeAnswer(a) === n)
}
