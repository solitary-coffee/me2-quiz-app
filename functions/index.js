const PAGE_STYLESHEETS = [
  '<link rel="stylesheet" href="/assets/mobile.css?v=20260904" media="all">',
  '<link rel="stylesheet" href="/assets/header-stability.css?v=20260904" media="all">',
  '<link rel="stylesheet" href="/assets/exam47-preliminary.css?v=20260905" media="all">'
].join('\n  ');

const PAGE_SCRIPTS = [
  '<script defer src="/assets/exam47-preliminary.js?v=20260905"></script>'
].join('\n  ');

function withPageEnhancements(html) {
  let output = html;

  if (!output.includes('/assets/mobile.css') ||
      !output.includes('/assets/header-stability.css') ||
      !output.includes('/assets/exam47-preliminary.css')) {
    if (output.includes('</head>')) {
      output = output.replace('</head>', `  ${PAGE_STYLESHEETS}\n</head>`);
    } else {
      output = `${PAGE_STYLESHEETS}\n${output}`;
    }
  }

  if (!output.includes('/assets/exam47-preliminary.js')) {
    if (output.includes('</body>')) {
      output = output.replace('</body>', `  ${PAGE_SCRIPTS}\n</body>`);
    } else {
      output = `${output}\n${PAGE_SCRIPTS}`;
    }
  }

  return output;
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

  return new Response(withPageEnhancements(html), {
    status: asset.status,
    statusText: asset.statusText,
    headers
  });
}
