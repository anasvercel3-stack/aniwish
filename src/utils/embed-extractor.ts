// Copied unchanged from artifacts/api-server/src/utils/embed-extractor.ts

export interface ExtractedStream {
    url: string;
    type: 'hls' | 'mp4';
}

const HLS_PATTERNS: RegExp[] = [
    /"(?:file|src|stream|source|hls|playlist|streamUrl|playbackUrl|url)"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/gi,
    /(?:file|src|stream|source|hls|playlist)\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
    /<source[^>]+src=["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
    /https?:\/\/[^\s"'<>]+\.m3u8(?:\?[^\s"'<>]*)?/gi,
];

const MP4_PATTERNS: RegExp[] = [
    /"(?:file|src|stream|source|mp4|url)"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/gi,
    /(?:file|src|stream|source|mp4)\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)/gi,
    /<source[^>]+src=["'](https?:\/\/[^"']+\.mp4[^"']*)/gi,
];

export function extractStreamUrls(html: string): ExtractedStream[] {
    const seen = new Set<string>();
    const results: ExtractedStream[] = [];
    for (const pattern of HLS_PATTERNS) {
        for (const match of html.matchAll(pattern)) {
            const url = match[1] ?? match[0];
            if (url && !seen.has(url) && url.includes('.m3u8')) { seen.add(url); results.push({ url, type: 'hls' }); }
        }
    }
    for (const pattern of MP4_PATTERNS) {
        for (const match of html.matchAll(pattern)) {
            const url = match[1] ?? match[0];
            if (url && !seen.has(url) && url.includes('.mp4')) { seen.add(url); results.push({ url, type: 'mp4' }); }
        }
    }
    return results;
}

export function extractIframeSrc(html: string): string | null {
    const match = html.match(/<iframe[^>]+\ssrc=["']([^"']+)["']/i);
    return match ? match[1] : null;
}

export function resolveUrl(url: string, base: string): string {
    if (url.startsWith('//')) return 'https:' + url;
    try { return new URL(url, base).href; } catch { return url; }
}
