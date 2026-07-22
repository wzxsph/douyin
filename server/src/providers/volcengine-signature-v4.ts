import { createHash, createHmac } from 'node:crypto'

export interface VolcengineV4Credentials {
  accessKeyId: string
  secretAccessKey: string
}

export interface VolcengineV4Request {
  method: string
  pathname?: string
  query: Record<string, string>
  body: string
  host: string
  contentType: string
  region: string
  service: string
  credentials: VolcengineV4Credentials
  now?: Date
}

export interface VolcengineV4Signature {
  authorization: string
  date: string
  contentSha256: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function uriEscape(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

export function canonicalQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([key, value]) => [uriEscape(key), uriEscape(value)] as const)
    .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}

function volcengineDate(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

export function signVolcengineV4(request: VolcengineV4Request): VolcengineV4Signature {
  const date = volcengineDate(request.now ?? new Date())
  const shortDate = date.slice(0, 8)
  const contentSha256 = sha256(request.body)
  const signedHeaders = 'content-type;host;x-content-sha256;x-date'
  const canonicalHeaders = [
    `content-type:${request.contentType.trim()}`,
    `host:${request.host.trim()}`,
    `x-content-sha256:${contentSha256}`,
    `x-date:${date}`
  ].join('\n')
  const canonicalRequest = [
    request.method.toUpperCase(),
    request.pathname ?? '/',
    canonicalQuery(request.query),
    `${canonicalHeaders}\n`,
    signedHeaders,
    contentSha256
  ].join('\n')
  const credentialScope = `${shortDate}/${request.region}/${request.service}/request`
  const stringToSign = ['HMAC-SHA256', date, credentialScope, sha256(canonicalRequest)].join('\n')
  const dateKey = hmac(request.credentials.secretAccessKey, shortDate)
  const regionKey = hmac(dateKey, request.region)
  const serviceKey = hmac(regionKey, request.service)
  const signingKey = hmac(serviceKey, 'request')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  return {
    date,
    contentSha256,
    authorization: [
      `HMAC-SHA256 Credential=${request.credentials.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(', ')
  }
}
