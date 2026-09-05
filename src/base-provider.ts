// Replaces BaseProvider from @omss/framework — pure fetch, no Node.js APIs.
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult } from './types.js';
import { cleanThirdPartyProxy } from './third-party-proxies.js';

export type { ProviderCapabilities, ProviderMediaObject, ProviderResult };

export abstract class BaseProvider {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly enabled: boolean;
    abstract readonly capabilities: ProviderCapabilities;

    // Set once per request by the router so proxy URLs are absolute.
    static proxyBaseUrl = '';

    abstract getMovieSources(media: ProviderMediaObject): Promise<ProviderResult>;
    abstract getTVSources(media: ProviderMediaObject): Promise<ProviderResult>;
    abstract healthCheck(): Promise<boolean>;

    /** Encode a URL + headers into the /v1/proxy?data= format. */
    createProxyUrl(url: string, headers: Record<string, string>): string {
        // Unwrap any known third-party proxy first
        const clean = cleanThirdPartyProxy(url);
        const data = JSON.stringify({ url: clean, headers });
        return `${BaseProvider.proxyBaseUrl}/v1/proxy?data=${encodeURIComponent(data)}`;
    }
}
