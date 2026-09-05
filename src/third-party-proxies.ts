// Copied verbatim from artifacts/api-server/src/thirdPartyProxies.ts
// These patterns detect and unwrap third-party proxy URLs so our own proxy
// can handle the real upstream directly.

export const knownThirdPartyProxies: Record<string, RegExp[]> = {
    'https://hls1.vid1.site': [/\/proxy\/(.+)$/],
    'https://madplay.site': [/\/api\/[^/]+\/proxy\?url=(.+)$/],
    'https://streams.smashystream.top': [/\/proxy\/m3u8\/(.+?)\/[^/]+$/],

    // AnimeCurx: preserve the full wrapper URL (don't strip it).
    'https://embed.animecurx.tech': [/^(https:\/\/embed\.animecurx\.tech\/api\/proxy\/hls\?url=.+)$/],

    '*': [
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/|https?%3A%2F%2F).+)$/,
        /^https:\/\/[^/]+\.workers\.dev\/((?:https?:\/\/)?[^/]+\/file2\/.+)$/,
        /^https:\/\/.+?\.workers\.dev\/((?:https?:\/\/).+)$/,
        /\/proxy\/(.+)$/,
        /\/(?:m3u8|mp4)-proxy\?url=(.+?)(?:&|$)/,
        /\/api\/[^/]+\/proxy\?url=(.+)$/,
        /[?&]url=(https?:\/\/.+?)(?:&|$)/,
        /[?&]src=(https?:\/\/.+?)(?:&|$)/,
        /[?&]link=(https?:\/\/.+?)(?:&|$)/,
        /[?&]stream=(https?:\/\/.+?)(?:&|$)/,
    ],
};

export function cleanThirdPartyProxy(proxyUrl: string): string {
    try {
        const urlObj = new URL(proxyUrl);
        const origin = urlObj.origin.toLowerCase();
        const patterns = [
            ...(knownThirdPartyProxies[origin] ?? []),
            ...(knownThirdPartyProxies['*'] ?? []),
        ];

        for (const pattern of patterns) {
            const match = proxyUrl.match(pattern);
            if (match) {
                let extracted = match[1];
                for (let i = 0; i < 5 && extracted.includes('%'); i++) {
                    try { extracted = decodeURIComponent(extracted); } catch { break; }
                }
                if (!extracted.startsWith('http')) {
                    extracted = 'https://' + extracted;
                }
                return extracted;
            }
        }
    } catch {
        // not a valid URL — return as-is
    }
    return proxyUrl;
}
