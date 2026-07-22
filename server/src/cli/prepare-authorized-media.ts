import { config as loadDotEnv } from 'dotenv'
import { loadRuntimeConfig } from '../config/env.js'
import { AuthorizedMediaPreparer } from '../media/authorized-media.js'

loadDotEnv({ path: process.env.CAIBAO_ENV_FILE || '.env', quiet: true })
const config = loadRuntimeConfig()
const preparer = new AuthorizedMediaPreparer({
  manifestPath: config.authorizedDouyinManifest,
  preparedRoot: config.authorizedMediaRoot,
  ffmpegPath: config.ffmpegPath,
  ffprobePath: config.ffprobePath
})

try {
  const result = await preparer.prepare()
  // Do not print local paths: only non-sensitive batch metadata is safe for logs.
  console.log(`Prepared authorized media batch ${result.batchId} (${result.itemCount} items)`)
} catch (error) {
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED_ERROR'
  console.error(`Authorized media preparation failed: ${code}`)
  process.exitCode = 1
}
