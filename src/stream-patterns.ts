// Copied from artifacts/api-server/src/streamPatterns.ts
// URLs matching these patterns are piped (streamed) rather than buffered.
export const streamPatterns: RegExp[] = [
    /pixeldrain\.dev|pixeldra\.in/i,
    /hub\.(raj\.lat|toxix\.buzz|oreao-cdn\.buzz)/i,
    /wasabisys\.com/i,
    /hakunaymatata\.com/i,
    /streamflixserver\.site|tripplestream\.online/i,
    /illimitableinkwell\.site/i,
    /frostcomet5\.pro/i,
    /(epimetheus63|earth14|pandora20)\.workers\.dev/i,
    /tiktokcdn\.com/i,
    /\/content\/[^?\s]+\/page-\d+\.html(?:\?|$)/i,
    /trendimovies\.com\/tgstream\/stream/i,
    /\.(mewstream|sparkora)\.buzz/i,
    /embed\.animecurx\.tech.*\.html/i,

    // MegaPlay serves MPEG-TS fragments from kotocdn.site using fake or
    // missing extensions, including URLs that end in .png or .html.
    /kotocdn\.site\/segment(?:[/?]|$)/i,

    // Fallback for equivalent segment endpoints when MegaPlay changes CDN
    // subdomains or another HLS provider uses a non-video extension.
    /\/(?:segment|segments|fragment|fragments|chunk|chunks)(?:[/?]|$)/i,

    // Default video extensions.
    /\.mp4(?:$|\?)/i,
    /\.mkv(?:$|\?)/i,
    /\.webm(?:$|\?)/i,
    /\.avi(?:$|\?)/i,
    /\.mov(?:$|\?)/i,
];
