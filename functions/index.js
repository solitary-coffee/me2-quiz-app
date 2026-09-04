const RESPONSIVE_STYLESHEETS = [
  '<link rel="stylesheet" href="/assets/mobile.css?v=20260904" media="all">',
  '<link rel="stylesheet" href="/assets/header-stability.css?v=20260904" media="all">'
].join('\n  ');

function withResponsiveStyles(html) {
  if (html.includes('/assets/mobile.css') && html.includes('/assets/header-stability.css')) return html;
  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${RESPONSIVE_STYLESHEETS}\n</head>`);
  }
  return `${RESPONSIVE_STYLESHEETS}\n${html}`;
}

export async function onRequestGet(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  const contentType = asset.headers.get('content-type') || '';

  if (!asset.ok || !contentType.includes('text/html')) {
    return asset;
  }

  const html = await asset.text();
  const headers = new Headers(asset.headers);

  // The body is rewritten, so stale byte-level metadata must not be reused.
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.set('content-type', 'text/html; charset=UTF-8');

  return new Response(withResponsiveStyles(html), {
    status: asset.status,
    statusText: asset.statusText,
    headers
  });
}
