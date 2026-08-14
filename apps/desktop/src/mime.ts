/**
 * Content-type lookup for the assets the `dsh://` protocol serves. Only
 * renderer asset types need entries; anything unknown is octet-stream.
 * @module @deepseek-ai/dsh-desktop/mime
 */

import { extname } from 'node:path'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Resolve the content type for a served file path.
 * @param pathname - the file path whose extension selects the type.
 * @returns the matched content type, or `application/octet-stream`.
 */
export function contentTypeFor(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] ?? 'application/octet-stream'
}
