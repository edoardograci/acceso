/**
 * Shortens a description to a specific length, trying to cut at a sentence or word boundary.
 * Google typically displays ~155-160 characters.
 */
export function shortenDescription(text: string, maxLength: number = 155): string {
  if (!text || text.length <= maxLength) return text;

  // Try to cut at the last sentence boundary before maxLength
  const sentenceEnd = text.lastIndexOf('.', maxLength);
  if (sentenceEnd > maxLength * 0.7) {
    return text.substring(0, sentenceEnd + 1);
  }

  // Fallback: cut at the last word boundary
  const lastSpace = text.lastIndexOf(' ', maxLength - 3);
  if (lastSpace > 0) {
    return text.substring(0, lastSpace) + '...';
  }

  // Hard cut if no spaces found (unlikely)
  return text.substring(0, maxLength - 3) + '...';
}
