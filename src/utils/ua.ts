// Copied unchanged from artifacts/api-server/src/utils/ua.ts

function getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomUserAgent(deviceType?: string, browserType?: string): string {
    const devices = ['android', 'windows', 'ubuntu'];
    const browsers = ['chrome', 'firefox'];
    if (!deviceType) deviceType = getRandomElement(devices);
    if (!browserType) browserType = getRandomElement(browsers);
    let browserVersion: string;
    if (browserType === 'chrome') {
        const major = Math.floor(Math.random() * (127 - 110) + 110);
        const minor = Math.floor(Math.random() * 10);
        const build = Math.floor(Math.random() * (10000 - 1000) + 1000);
        const patch = Math.floor(Math.random() * 100);
        browserVersion = `${major}.${minor}.${build}.${patch}`;
    } else {
        browserVersion = getRandomElement(Array.from({ length: 10 }, (_, i) => 90 + i)).toString();
    }
    if (deviceType === 'windows') {
        const wv = getRandomElement(['10.0', '11.0']);
        return browserType === 'chrome'
            ? `Mozilla/5.0 (Windows NT ${wv}; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`
            : `Mozilla/5.0 (Windows NT ${wv}; Win64; x64; rv:${browserVersion}.0) Gecko/${browserVersion}.0 Firefox/${browserVersion}.0`;
    } else if (deviceType === 'ubuntu') {
        return browserType === 'chrome'
            ? `Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:94.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`
            : `Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:${browserVersion}.0) Gecko/${browserVersion}.0 Firefox/${browserVersion}.0`;
    }
    return '';
}
