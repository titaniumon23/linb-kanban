import { safeExternalUrl } from './model';

export interface LinkPreview { url: string; title: string; description: string; image: string; video: boolean }
export type PreviewRequest = (url: string) => Promise<{ text: string; status: number; headers: Record<string, string> }>;

// Skip non-web, credential-bearing and explicitly local URLs when fetching previews.
export function previewUrl(value: string, base?: string): string {
  try {
    const url = new URL(value, base);
    if (!safeExternalUrl(url.href) || url.username || url.password) return '';
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.includes(':')) return '';
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
    return url.href;
  } catch { return ''; }
}
export function videoUrl(url: string): boolean {
  const { hostname: host, pathname: path } = new URL(url);
  return /\.(mp4|webm|mov|m4v)(?:$)/i.test(path) ||
    ((host === 'youtu.be' && path.length > 1) || /(^|\.)youtube\.com$/.test(host) && /^\/(watch|shorts\/|embed\/|live\/)/.test(path)) ||
    /(^|\.)bilibili\.com$/.test(host) && /^\/video\//.test(path) ||
    /(^|\.)vimeo\.com$/.test(host) && /^\/\d+/.test(path) ||
    /(^|\.)douyin\.com$/.test(host) && /^\/video\//.test(path);
}
export function fallbackPreview(url: string): LinkPreview {
  return { url, title: new URL(url).hostname.replace(/^www\./, ''), description: '', image: '', video: videoUrl(url) };
}
export function cardPreviewUrl(link: string, body: string): string {
  if (safeExternalUrl(link)) return safeExternalUrl(link)!;
  const prose = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`]*`|!\[[^\]]*\]\([^)]*\)/g, '');
  const match = prose.match(/https?:\/\/[^\s<>\u3000]+/i);
  return match ? safeExternalUrl(match[0].replace(/[)\]，。；、.!?]+$/, '')) || '' : '';
}
// Parse only metadata strings. Never mount or execute the remote document.
export function parsePreview(url: string, html: string): LinkPreview {
  const preview = fallbackPreview(url);
  const decode = (value: string) => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
  const values = new Map<string, string>();
  const head = html.slice(0, 2_000_000).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of head.match(/<meta\s[^>]*>/gi) || []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes.set(match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4]));
    const key = (attributes.get('property') || attributes.get('name') || '').toLowerCase();
    if (key && !values.has(key)) values.set(key, attributes.get('content') || '');
  }
  const title = values.get('og:title') || values.get('twitter:title') || decode(head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
  preview.title = title.trim().slice(0, 240) || preview.title;
  preview.description = (values.get('og:description') || values.get('description') || values.get('twitter:description') || '').trim().slice(0, 350);
  preview.image = previewUrl(values.get('og:image:secure_url') || values.get('og:image') || values.get('twitter:image') || '', url);
  if (!values.get('og:image:secure_url') && !values.get('og:image') && !values.get('twitter:image')) preview.image = '';
  preview.video ||= /^video(?:\.|$)/i.test(values.get('og:type') || '') || !!values.get('og:video') || !!values.get('og:video:url') || values.get('twitter:card') === 'player';
  return preview;
}

/** Per-plugin cache deduplicates rendering requests; failures never block card operations. */
export class LinkPreviewService {
  private cache = new Map<string, Promise<LinkPreview>>();
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private readonly request: PreviewRequest) {}
  get(value: string): Promise<LinkPreview> {
    const url = previewUrl(value);
    if (!url) return Promise.resolve(fallbackPreview(value));
    const existing = this.cache.get(url); if (existing) return existing;
    if (this.cache.size >= 150) this.cache.delete(this.cache.keys().next().value!);
    const result = this.enqueue(url); this.cache.set(url, result); return result;
  }
  private async enqueue(url: string): Promise<LinkPreview> {
    if (this.active >= 3) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try { return await this.load(url); }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
  private async load(url: string): Promise<LinkPreview> {
    const fallback = fallbackPreview(url);
    if (/\.(mp4|webm|mov|m4v|pdf|zip|png|jpe?g|gif|webp)$/i.test(new URL(url).pathname)) return fallback;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([this.request(url), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Preview timeout')), 8000); })]);
      const type = Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
      if (response.status >= 400 || !/text\/html|application\/xhtml\+xml/i.test(type)) return fallback;
      return parsePreview(url, response.text);
    } catch { return fallback; }
    finally { if (timer) clearTimeout(timer); }
  }
}
