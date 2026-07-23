import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicCatalogPath = path.resolve(
  process.env.SHOWCASE_PUBLIC_CATALOG ??
    path.join(repositoryRoot, 'src/showcase/public-video-ids.json')
)
const bundlePath = path.resolve(
  process.env.SHOWCASE_BUNDLE ??
    path.join(repositoryRoot, 'src/showcase/generated/showcase-bundle.json')
)
const outputDirectory = path.resolve(
  process.env.SHOWCASE_PAGES_MEDIA_OUTPUT ?? path.join(repositoryRoot, 'dist/media')
)
const sourceDirectory = process.env.SHOWCASE_MEDIA_SOURCE_DIRECTORY?.trim()
const sourceBaseUrl = (
  process.env.SHOWCASE_MEDIA_SOURCE_BASE_URL ??
  'https://github.com/wzxsph/douyin/releases/download/showcase-media-20260723-v1/'
).replace(/\/?$/, '/')

const publicCatalog = JSON.parse(await readFile(publicCatalogPath, 'utf8'))
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'))
const videoIds = publicCatalog.videoIds

if (!Array.isArray(videoIds) || videoIds.length !== 10 || new Set(videoIds).size !== 10) {
  throw new Error('The public Pages catalog must contain exactly ten unique video ids')
}

const catalogByVideoId = new Map(bundle.catalog.map((item) => [item.videoId, item]))
const selectedItems = videoIds.map((videoId) => {
  const item = catalogByVideoId.get(videoId)
  if (!item) throw new Error(`Public video is missing from the generated bundle: ${videoId}`)
  return item
})

function assertSafeFileName(fileName, extension) {
  if (path.basename(fileName) !== fileName || !fileName.endsWith(extension)) {
    throw new Error(`Unsafe showcase asset filename: ${fileName}`)
  }
}

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(60_000)
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  throw new Error(`Unable to download ${url}: ${String(lastError)}`)
}

async function readAsset(kind, fileName) {
  if (sourceDirectory) {
    return readFile(path.join(path.resolve(sourceDirectory), kind, fileName))
  }
  return fetchWithRetry(new URL(fileName, sourceBaseUrl))
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function stageItem(item) {
  assertSafeFileName(item.mediaFile, '.mp4')
  assertSafeFileName(item.posterFile, '.jpg')
  if (!item.derivativeSha256 || !item.derivativeBytes) {
    throw new Error(`Public video has no prepared derivative metadata: ${item.videoId}`)
  }

  const [video, poster] = await Promise.all([
    readAsset('video', item.mediaFile),
    readAsset('poster', item.posterFile)
  ])
  if (video.byteLength !== item.derivativeBytes) {
    throw new Error(
      `Derivative byte mismatch for ${item.videoId}: expected ${item.derivativeBytes}, got ${video.byteLength}`
    )
  }
  if (sha256(video) !== item.derivativeSha256) {
    throw new Error(`Derivative SHA-256 mismatch for ${item.videoId}`)
  }
  if (video.subarray(4, 8).toString('ascii') !== 'ftyp') {
    throw new Error(`Derivative is not an MP4 file: ${item.videoId}`)
  }
  if (poster.byteLength < 3 || !poster.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    throw new Error(`Poster is not a JPEG file: ${item.videoId}`)
  }

  await Promise.all([
    writeFile(path.join(outputDirectory, item.mediaFile), video),
    writeFile(path.join(outputDirectory, item.posterFile), poster)
  ])
  return {
    videoId: item.videoId,
    videoFile: item.mediaFile,
    videoBytes: video.byteLength,
    videoSha256: item.derivativeSha256,
    posterFile: item.posterFile,
    posterBytes: poster.byteLength
  }
}

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
const staged = await Promise.all(selectedItems.map(stageItem))
const manifest = {
  schemaVersion: 1,
  source: sourceDirectory ? 'local-prepared-media' : sourceBaseUrl,
  count: staged.length,
  totalBytes: staged.reduce((sum, item) => sum + item.videoBytes + item.posterBytes, 0),
  items: staged
}
await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
)
process.stdout.write(
  `${JSON.stringify({ outputDirectory, count: staged.length, totalBytes: manifest.totalBytes })}\n`
)
