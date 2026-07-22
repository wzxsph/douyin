import { buildRuntime } from './runtime.js'

const { app, config } = buildRuntime()
app.listen(config.apiPort, config.apiHost, () => {
  // Deliberately log only non-secret startup metadata.
  console.log(`Caibao analysis API listening on http://${config.apiHost}:${config.apiPort}`)
  console.log(`Analysis provider: ${config.analysisProvider}`)
})
