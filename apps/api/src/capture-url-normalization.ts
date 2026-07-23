const TRACKING_PARAMETER_NAMES = new Set([
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "oq",
  "ref",
  "source",
  "sourceid",
  "sxsrf",
  "ttclid",
  "uact",
  "ved",
  "wbraid",
  "yclid",
]);

const TRACKING_PARAMETER_PREFIXES = ["_ga", "_gl", "ga_", "utm_"];

type CaptureSource = {
  title: string;
  url: string;
};

function isTrackingParameter(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return (
    TRACKING_PARAMETER_NAMES.has(normalizedName) ||
    TRACKING_PARAMETER_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))
  );
}

export function canonicalizeCaptureUrl(value: string): string {
  const url = new URL(value);

  for (const parameterName of Array.from(url.searchParams.keys())) {
    if (isTrackingParameter(parameterName)) {
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
