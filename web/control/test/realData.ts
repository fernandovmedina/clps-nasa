import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Lee un JSON real (vitest corre con cwd en web/) de public/data para que las pruebas usen los mismos datos que la app. */
export function readPublicJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'public', path.replace(/^\//, '')), 'utf8')) as T
}

/** fetch falso que sirve los archivos reales de public/data/ (lo que hace el export estático). */
export async function fetchPublic(path: string): Promise<Response> {
  try {
    return new Response(JSON.stringify(readPublicJson(path)))
  } catch {
    return new Response('missing', { status: 404 })
  }
}
