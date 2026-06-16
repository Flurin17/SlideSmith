export function cleanCaption(raw: string): string {
  return String(raw || '')
    .replace(/(^|\s)#+[\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanHashtags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw || []) {
    const tag = String(item || '')
      .trim()
      .replace(/^#+/, '')
      .replace(/[^\p{L}\p{N}_]/gu, '');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function formatPostCaption(caption: string, hashtags: string[]): string {
  const cleanTags = cleanHashtags(hashtags);
  const cleanText = cleanCaption(caption);
  return `${cleanText}${cleanTags.length ? `${cleanText ? ' ' : ''}${cleanTags.map((t) => `#${t}`).join(' ')}` : ''}`;
}
