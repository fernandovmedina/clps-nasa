import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../out/', import.meta.url))
const port = Number(process.env.PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

async function resolveFile(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  const candidate = join(root, clean)
  if (!candidate.startsWith(root)) return null
  const info = await stat(candidate).catch(() => null)
  if (info?.isDirectory()) return join(candidate, 'index.html')
  return info ? candidate : null
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const file = await resolveFile(url.pathname)
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    return
  }
  const body = await readFile(file)
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body)
}).listen(port, '127.0.0.1')
