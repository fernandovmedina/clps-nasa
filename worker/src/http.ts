export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export const badRequest = (message: string): HttpError => new HttpError(400, 'INVALID_PARAMETER', message)
export const notFound = (message: string): HttpError => new HttpError(404, 'NOT_FOUND', message)

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function errorResponse(error: HttpError): Response {
  return jsonResponse(
    { error: { code: error.code, message: error.message } },
    { status: error.status, headers: { 'cache-control': 'no-store', ...error.headers } },
  )
}
