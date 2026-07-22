import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { AuthorizedMediaPreparer } from '../media/authorized-media.js'

const manifestPath = path.resolve(
  process.env.AUTHORIZED_DOUYIN_MANIFEST ??
    './media-import/authorized-douyin/download-manifest.json'
)
const preparedRoot = path.resolve(
  process.env.SHOWCASE_MEDIA_ROOT ?? './.analysis-work/showcase-media'
)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { batchId?: string }
const preparedManifestPath = path.join(
  preparedRoot,
  String(manifest.batchId ?? ''),
  'prepared-manifest.json'
)

try {
  await access(preparedManifestPath)
  process.stdout.write(`${JSON.stringify({ status: 'already_prepared', preparedManifestPath })}\n`)
} catch {
  const result = await new AuthorizedMediaPreparer({
    manifestPath,
    preparedRoot,
    maxLongEdge: 640,
    videoPreset: 'veryfast',
    videoCrf: 30,
    maxVideoBitrateKbps: 550,
    audioBitrate: '48k',
    posterLongEdge: 640
  }).prepare()
  process.stdout.write(`${JSON.stringify({ status: 'prepared', ...result })}\n`)
}
