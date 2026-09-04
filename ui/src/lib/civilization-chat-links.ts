/**
 * The Architect runs on the VPS and therefore uses a loopback API URL for its
 * shell calls. Those URLs are not usable by the board user's browser. Keep
 * Paperclip navigation links relative so they resolve against the deployment
 * currently open in the browser.
 */
const PAPERCLIP_PAGE_PATH = /^\/(?:[a-z][a-z0-9]*\/issues\/[a-z][a-z0-9]*-\d+|issues\/[a-z][a-z0-9]*-\d+|(?:agents|projects|skills|routines|org|timeline|costs|activity|settings|dashboard)(?:\/|$)|api\/attachments\/)/i;

function isLoopbackHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** Convert only known Paperclip pages from a VPS-only URL to a site-relative URL. */
export function resolveCivilizationChatHref(href: string): string {
  try {
    const url = new URL(href);
    if (!isLoopbackHost(url.hostname) || !PAPERCLIP_PAGE_PATH.test(url.pathname)) return href;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}
