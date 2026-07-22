import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  scripts?: Record<string, string>
}

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as PackageManifest

describe('local development network boundary', () => {
  it.each(['dev', 'start', 'serve'])('%s binds Vite to the loopback interface', (name) => {
    const script = manifest.scripts?.[name]
    expect(script).toContain('--host 127.0.0.1')
    expect(script).not.toContain('0.0.0.0')
  })
})
