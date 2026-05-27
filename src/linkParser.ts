import type { FoundLink } from './types';

let idCounter = 0;
function nextId(): string {
  return `link-${++idCounter}`;
}

/** Decode common HTML entities so href values are clean URLs. */
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

/**
 * Parse HTML content for <a href="..."> anchor tags.
 * Uses regex rather than DOMParser so handlebars hrefs are preserved as-is.
 */
export function parseHtml(html: string): FoundLink[] {
  const links: FoundLink[] = [];
  const seen = new Set<string>();

  // Match <a ...href="..."...>text</a> — handles both single and double quotes
  const anchorRe = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = anchorRe.exec(html)) !== null) {
    const rawUrl = decodeEntities((m[1] ?? m[2] ?? '').trim());
    if (!rawUrl) continue;

    // Skip anchors with no useful URL (javascript:, #only, mailto:)
    if (rawUrl.startsWith('javascript:') || rawUrl.startsWith('mailto:') || rawUrl === '#') continue;

    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);

    // Strip inner HTML tags to get display text
    const displayText = (m[4] ?? '').replace(/<[^>]+>/g, '').trim() || undefined;

    links.push({
      id: nextId(),
      rawUrl,
      displayText,
      sourceFile: 'html',
      sourceType: 'anchor',
    });
  }

  return links;
}

/**
 * Parse plain text content for URLs and bare handlebars tokens.
 * Valid entries:
 *   - http:// or https:// URLs
 *   - bare {{token}} tokens (entire URL is a template variable)
 */
export function parseText(text: string): FoundLink[] {
  const links: FoundLink[] = [];
  const seen = new Set<string>();

  // Match http/https URLs — stop at whitespace, quotes, angle brackets
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let m: RegExpExecArray | null;

  while ((m = urlRe.exec(text)) !== null) {
    const rawUrl = m[0].replace(/[.,;!?)]+$/, ''); // strip trailing punctuation
    if (seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    links.push({
      id: nextId(),
      rawUrl,
      sourceFile: 'text',
      sourceType: 'raw',
    });
  }

  // Match bare {{token}} on their own (whole-URL handlebars in plain text)
  const hbsRe = /(?:^|[\s,])(\{\{[^}\s]+\}\})(?:$|[\s,.])/gm;
  while ((m = hbsRe.exec(text)) !== null) {
    const rawUrl = (m[1] ?? '').trim();
    if (!rawUrl || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    links.push({
      id: nextId(),
      rawUrl,
      sourceFile: 'text',
      sourceType: 'raw',
    });
  }

  return links;
}
