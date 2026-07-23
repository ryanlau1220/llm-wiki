const TRACKING_PARAMETER_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ttclid",
  "wbraid",
  "yclid",
]);

const TRACKING_PARAMETER_PREFIXES = ["_ga", "_gl", "ga_", "utm_"];
const GOOGLE_SEARCH_PATH = "/search";
const GOOGLE_SEARCH_TRACKING_PARAMETER_NAMES = new Set([
  "ei",
  "oq",
  "sca_esv",
  "source",
  "sourceid",
  "sclient",
  "sxsrf",
  "uact",
  "ved",
]);

type CaptureSource = {
  title: string;
  url: string;
};

function isGoogleSearchUrl(url: URL): boolean {
  return url.pathname === GOOGLE_SEARCH_PATH && /(^|\.)google\.[a-z.]+$/i.test(url.hostname);
}

function isTrackingParameter(url: URL, name: string): boolean {
  const normalizedName = name.toLowerCase();
  return (
    TRACKING_PARAMETER_NAMES.has(normalizedName) ||
    TRACKING_PARAMETER_PREFIXES.some((prefix) => normalizedName.startsWith(prefix)) ||
    (isGoogleSearchUrl(url) && GOOGLE_SEARCH_TRACKING_PARAMETER_NAMES.has(normalizedName))
  );
}

export function canonicalizeCaptureUrl(value: string): string {
  const url = new URL(value);

  for (const parameterName of Array.from(url.searchParams.keys())) {
    if (isTrackingParameter(url, parameterName)) {
      url.searchParams.delete(parameterName);
    }
  }

  url.hash = "";
  return url.toString();
}

export function canonicalizeCaptureSources(sources: CaptureSource[]): CaptureSource[] {
  const uniqueSources = new Map<string, CaptureSource>();

  for (const source of sources) {
    const url = canonicalizeCaptureUrl(source.url);
    if (!uniqueSources.has(url)) {
      uniqueSources.set(url, { ...source, url });
    }
  }

  return Array.from(uniqueSources.values());
}
