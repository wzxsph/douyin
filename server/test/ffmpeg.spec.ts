import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FfmpegMediaPreprocessor } from '../src/media/ffmpeg.js'

describe('FfmpegMediaPreprocessor', () => {
  it('rejects a file outside the configured import root before invoking tools', async () => {
    const run = vi.fn()
    const preprocessor = new FfmpegMediaPreprocessor({
      mediaImportRoot: path.resolve('/safe/media'),
      workRoot: path.resolve('/safe/work'),
      runner: { run }
    })

    await expect(preprocessor.prepare('/etc/passwd', 'job-1')).rejects.toMatchObject({
      code: 'MEDIA_PATH_OUTSIDE_IMPORT_ROOT'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('reports missing media tools as readiness, not as a false success', async () => {
    const preprocessor = new FfmpegMediaPreprocessor({
      mediaImportRoot: path.resolve('/safe/media'),
      workRoot: path.resolve('/safe/work'),
      runner: {
        run: vi.fn(async () => {
          throw Object.assign(new Error('not found'), { code: 'ENOENT' })
        })
      }
    })

    await expect(preprocessor.readiness()).resolves.toEqual({
      ready: false,
      missing: ['ffmpeg', 'ffprobe']
    })
  })
})
