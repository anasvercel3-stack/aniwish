// Shared types — mirrors the @omss/framework public API

export interface ProviderCapabilities {
    supportedContentTypes: ('movies' | 'tv' | string)[];
}

export interface ProviderMediaObject {
    type: 'movie' | 'tv';
    tmdbId: number;
    title?: string;
    // TV only
    s?: number;
    e?: number;
}

export interface ProviderSource {
    url: string;
    type: 'hls' | 'mp4';
    quality: string;
    audioTracks?: Array<{ label: string; language: string }>;
    provider: { id: string; name: string };
}

export interface ProviderSubtitle {
    url: string;
    label: string;
    format: 'srt' | 'vtt' | 'ass';
}

export interface ProviderDiagnostic {
    code: string;
    message: string;
    field: string;
    severity: 'error' | 'warning' | 'info';
}

export interface ProviderResult {
    sources: ProviderSource[];
    subtitles: ProviderSubtitle[];
    diagnostics: ProviderDiagnostic[];
}

export interface AggregatedResult {
    responseId: string;
    expiresAt: string;
    sources: ProviderSource[];
    subtitles: ProviderSubtitle[];
    diagnostics: ProviderDiagnostic[];
}

// Env bindings injected by CF Workers runtime
export interface Env {
    TMDB_API_KEY: string;
    NODE_ENV?: string;
    CORS_ORIGIN?: string;
    /**
     * HMAC-SHA-256 secret used to sign short-lived tokens.
     * Set with: wrangler secret put TOKEN_SECRET
     * If not set the API runs without token protection (dev/preview mode).
     */
    TOKEN_SECRET?: string;
    // Static asset binding — serves embed player files for non-API routes
    ASSETS: Fetcher;
}
