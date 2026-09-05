// Copied unchanged from artifacts/api-server/src/utils/xpass-resolver.ts

export interface XPassBackup { id: string; name: string; url: string; dl?: boolean }
interface XPassPlaylistSource { file: string; type?: string; label?: string }
interface XPassPlaylistEntry { sources?: XPassPlaylistSource[] }
export interface XPassSource { url: string; type: 'hls' | 'mp4'; quality: string; }

const XPASS_BASE = 'https://play.xpass.top';

export function inferXpassType(type: string | undefined, url: string): 'hls' | 'mp4' {
    if (type === 'hls' || url.includes('.m3u8')) return 'hls';
    return 'mp4';
}

export async function fetchXpassEmbedHtml(embedUrl: string, headers: Record<string, string>): Promise<string | null> {
    try {
        const res = await fetch(embedUrl, { headers: { ...headers, Referer: embedUrl }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}

export function extractXpassBackups(html: string): XPassBackup[] {
    const match = html.match(/var\s+backups\s*=\s*(\[)/);
    if (!match) return [];
    const start = html.indexOf('[', match.index!);
    let depth = 0, end = start;
    for (let i = start; i < html.length; i++) {
        if (html[i] === '[') depth++;
        else if (html[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    try { return JSON.parse(html.substring(start, end + 1)) as XPassBackup[]; } catch { return []; }
}

export async function fetchXpassSources(backup: XPassBackup, headers: Record<string, string>): Promise<XPassSource[]> {
    try {
        const res = await fetch(backup.url.startsWith('http') ? backup.url : `${XPASS_BASE}${backup.url}`, { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return [];
        const data = await res.json() as XPassPlaylistEntry[];
        const sources: XPassSource[] = [];
        for (const entry of data) {
            for (const src of entry.sources ?? []) {
                if (src.file) sources.push({ url: src.file, type: inferXpassType(src.type, src.file), quality: src.label ?? 'Auto' });
            }
        }
        return sources;
    } catch { return []; }
}
