// TMDB validation service — ported from @omss/framework's TMDBService.
// Uses CF Cache API so validation results survive across requests.

const BASE = 'https://api.themoviedb.org/3';

export interface TMDBValidation {
    exists: boolean;
    released: boolean;
    title?: string;
    releaseDate?: string;
    message?: string;
}

async function cacheGet(key: string): Promise<TMDBValidation | null> {
    try {
        const cache = caches.default;
        const res = await cache.match(`https://tmdb.cache.internal/${key}`);
        if (!res) return null;
        return await res.json() as TMDBValidation;
    } catch { return null; }
}

async function cacheSet(key: string, value: TMDBValidation, ttl: number): Promise<void> {
    try {
        const cache = caches.default;
        const res = new Response(JSON.stringify(value), {
            headers: { 'Cache-Control': `public, max-age=${ttl}`, 'Content-Type': 'application/json' },
        });
        await cache.put(`https://tmdb.cache.internal/${key}`, res);
    } catch { /* cache best-effort */ }
}

export async function validateMovie(tmdbId: number, apiKey: string): Promise<TMDBValidation> {
    const cacheKey = `movie:${tmdbId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${BASE}/movie/${tmdbId}?api_key=${apiKey}`);
        if (res.status === 404) {
            const result: TMDBValidation = { exists: false, released: false, message: `Movie ${tmdbId} not found` };
            await cacheSet(cacheKey, result, 3600);
            return result;
        }
        const movie = await res.json() as { title: string; release_date: string; status: string };
        const released = !!movie.release_date && new Date(movie.release_date) <= new Date() && movie.status === 'Released';
        const result: TMDBValidation = {
            exists: true, released,
            title: movie.title,
            releaseDate: movie.release_date,
            message: released ? undefined : `"${movie.title}" not released yet`,
        };
        await cacheSet(cacheKey, result, 86400);
        return result;
    } catch {
        // On error, allow through rather than blocking valid requests
        return { exists: true, released: true };
    }
}

export async function validateTV(tmdbId: number, apiKey: string): Promise<TMDBValidation> {
    const cacheKey = `tv:${tmdbId}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`${BASE}/tv/${tmdbId}?api_key=${apiKey}`);
        if (res.status === 404) {
            const result: TMDBValidation = { exists: false, released: false, message: `TV show ${tmdbId} not found` };
            await cacheSet(cacheKey, result, 3600);
            return result;
        }
        const tv = await res.json() as { name: string; first_air_date: string };
        const aired = !!tv.first_air_date && new Date(tv.first_air_date) <= new Date();
        const result: TMDBValidation = {
            exists: true, released: aired,
            title: tv.name,
            releaseDate: tv.first_air_date,
            message: aired ? undefined : `"${tv.name}" not aired yet`,
        };
        await cacheSet(cacheKey, result, 86400);
        return result;
    } catch {
        return { exists: true, released: true };
    }
}
