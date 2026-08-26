const MANIFEST_URL =
  'https://raw.githubusercontent.com/void-c0de/finance-app/master/docs/api/manifest.json';

const PUBLIC_BASE =
  'https://void-c0de.github.io/finance-app';

const RAW_RELEASE_BASE =
  'https://raw.githubusercontent.com/void-c0de/finance-app/master/docs';

const responseHeaders = {
  'Content-Type': 'application/expo+json',
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'expo-manifest-filters': '',
  'expo-server-defined-headers': '',
  'Cache-Control': 'private, max-age=0, no-store',
};

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: responseHeaders,
  });
}

function absoluteAssetUrl(value: unknown): unknown {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return value;
  }

  return `${PUBLIC_BASE}${value.startsWith('/finance-app/')
    ? value.slice('/finance-app'.length)
    : value}`;
}

function rawReleaseUrl(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const parsed = new URL(value, PUBLIC_BASE);
  const releasePath = parsed.pathname.startsWith('/finance-app/')
    ? parsed.pathname.slice('/finance-app'.length)
    : parsed.pathname;

  return `${RAW_RELEASE_BASE}${releasePath}`;
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed');
  }

  const platform = request.headers.get('expo-platform');
  const runtimeVersion = request.headers.get('expo-runtime-version');

  if (platform && platform !== 'android') {
    return errorResponse(404, 'platform_not_supported');
  }

  try {
    const upstream = await fetch(`${MANIFEST_URL}?ts=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!upstream.ok) {
      return errorResponse(503, 'manifest_unavailable');
    }

    const manifest = await upstream.json() as {
      runtimeVersion?: unknown;
      launchAsset?: { url?: unknown };
      assets?: { url?: unknown }[];
      [key: string]: unknown;
    };

    if (
      typeof manifest.runtimeVersion !== 'string' ||
      (runtimeVersion && runtimeVersion !== manifest.runtimeVersion)
    ) {
      return errorResponse(404, 'runtime_not_supported');
    }

    if (manifest.launchAsset) {
      manifest.launchAsset.url = rawReleaseUrl(manifest.launchAsset.url);
    }

    if (Array.isArray(manifest.assets)) {
      for (const asset of manifest.assets) {
        asset.url = absoluteAssetUrl(asset.url);
      }
    }

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse(503, 'manifest_unavailable');
  }
});
