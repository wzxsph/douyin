import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { generateShowcaseBundle } from '../showcase/mock-content-generator.js'

const manifestPath = path.resolve(
  process.env.AUTHORIZED_DOUYIN_MANIFEST ??
    './media-import/authorized-douyin/download-manifest.json'
)
const preparedRoot = path.resolve(
  process.env.SHOWCASE_MEDIA_ROOT ?? './.analysis-work/showcase-media'
)
const outputPath = path.resolve(
  process.env.SHOWCASE_BUNDLE_OUTPUT ?? './src/showcase/generated/showcase-bundle.json'
)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
  batchId: string
  finalizedAt?: string
  createdAt?: string
}
let preparedManifest: unknown
try {
  preparedManifest = JSON.parse(
    await readFile(path.join(preparedRoot, manifest.batchId, 'prepared-manifest.json'), 'utf8')
  )
} catch {
  preparedManifest = undefined
}

const bundle = await generateShowcaseBundle({
  manifest,
  preparedManifest,
  generatedAt:
    process.env.SHOWCASE_GENERATED_AT ?? manifest.finalizedAt ?? manifest.createdAt ?? undefined
})
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({ outputPath, items: bundle.catalog.length, experiences: bundle.experiences.length })}\n`
)
