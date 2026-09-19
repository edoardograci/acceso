/**
 * Returns the first sentence of a longer text, truncated to maxLen if that
 * sentence alone is still too long for a card. Used to show a one-line
 * specialty/description snippet on directory cards without dumping a full
 * studio bio into a grid of 50+ items.
 */
export function firstSentence(text: string | null | undefined, maxLen = 90): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^.!?]*[.!?]/);
  const sentence = (match ? match[0] : trimmed).trim();
  return sentence.length > maxLen ? `${sentence.slice(0, maxLen - 1).trimEnd()}…` : sentence;
}
