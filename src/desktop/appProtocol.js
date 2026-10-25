import path from 'node:path';

export const appUrl = 'lol-draw://app/';

export function resolveAsset(root, rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'lol-draw:' || url.host !== 'app' || url.username || url.password) return null;
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.includes('\\') || pathname.includes('\0')) return null;
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  const relative = path.relative(root, target);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? target : null;
}
