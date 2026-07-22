import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { PreparedMedia } from '../domain/contracts.js'
import { AppError } from '../domain/errors.js'

export interface CommandResult {
  stdout: string
  stderr: string
}
export interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult>
}

export class NodeCommandRunner implements CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr })
        else
          reject(
            new AppError('MEDIA_TOOL_FAILED', 'Media tool command failed', {
              status: 422,
              details: {
                command: path.basename(command),
                exitCode: code,
                stderr: stderr.slice(-500)
              }
            })
          )
      })
    })
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return `sha256:${hash.digest('hex')}`
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export interface MediaToolReadiness {
  ready: boolean
  missing: string[]
}

export class FfmpegMediaPreprocessor {
  private readonly runner: CommandRunner
  private readonly ffmpegPath: string
  private readonly ffprobePath: string

  constructor(
    private readonly options: {
      mediaImportRoot: string
      workRoot: string
      ffmpegPath?: string
      ffprobePath?: string
      frameIntervalSeconds?: number
      runner?: CommandRunner
    }
  ) {
    this.runner = options.runner ?? new NodeCommandRunner()
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.ffprobePath = options.ffprobePath ?? 'ffprobe'
  }

  async readiness(): Promise<MediaToolReadiness> {
    const missing: string[] = []
    await this.runner.run(this.ffmpegPath, ['-version']).catch(() => missing.push('ffmpeg'))
    await this.runner.run(this.ffprobePath, ['-version']).catch(() => missing.push('ffprobe'))
    return { ready: missing.length === 0, missing }
  }

  async prepare(localPath: string, jobId: string): Promise<PreparedMedia> {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) {
      throw new AppError('ANALYSIS_JOB_ID_INVALID', 'Analysis job id is invalid')
    }
    const configuredRoot = path.resolve(this.options.mediaImportRoot)
    const requestedPath = path.resolve(localPath)
    if (!isWithin(configuredRoot, requestedPath)) {
      throw new AppError(
        'MEDIA_PATH_OUTSIDE_IMPORT_ROOT',
        'Media must be placed under MEDIA_IMPORT_ROOT',
        { status: 403 }
      )
    }

    let root: string
    let source: string
    try {
      root = await realpath(configuredRoot)
      source = await realpath(requestedPath)
    } catch (error) {
      throw new AppError('MEDIA_FILE_NOT_FOUND', 'Media file or import root does not exist', {
        status: 404,
        cause: error
      })
    }
    if (!isWithin(root, source)) {
      throw new AppError(
        'MEDIA_PATH_OUTSIDE_IMPORT_ROOT',
        'Symlink resolves outside MEDIA_IMPORT_ROOT',
        {
          status: 403
        }
      )
    }

    const ready = await this.readiness()
    if (!ready.ready) {
      throw new AppError('MEDIA_TOOL_UNAVAILABLE', 'FFmpeg and FFprobe are required', {
        status: 503,
        details: { missing: ready.missing }
      })
    }

    const workDir = path.resolve(this.options.workRoot, jobId)
    const framesDir = path.join(workDir, 'frames')
    await mkdir(framesDir, { recursive: true })

    const probe = await this.runner.run(this.ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-show_streams',
      '-of',
      'json',
      source
    ])
    let durationMs = 0
    try {
      const metadata = JSON.parse(probe.stdout) as Record<string, any>
      durationMs = Math.round(Number(metadata.format?.duration ?? 0) * 1000)
    } catch (error) {
      throw new AppError('MEDIA_PROBE_INVALID', 'FFprobe returned invalid metadata', {
        status: 422,
        cause: error
      })
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new AppError('MEDIA_DURATION_INVALID', 'Media duration is missing or invalid', {
        status: 422
      })
    }

    const audioPath = path.join(workDir, 'audio.wav')
    await this.runner.run(this.ffmpegPath, [
      '-y',
      '-i',
      source,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'pcm_s16le',
      audioPath
    ])

    const frameIntervalSeconds = this.options.frameIntervalSeconds ?? 8
    await this.runner.run(this.ffmpegPath, [
      '-y',
      '-i',
      source,
      '-vf',
      `fps=1/${frameIntervalSeconds},scale=720:-2`,
      '-q:v',
      '3',
      path.join(framesDir, 'frame-%06d.jpg')
    ])
    const frameFiles = (await readdir(framesDir))
      .filter((name) => /^frame-\d+\.jpg$/.test(name))
      .sort()
    const frames = frameFiles.map((name, index) => ({
      frameId: name.replace(/\.jpg$/, ''),
      path: path.join(framesDir, name),
      timeMs: index * frameIntervalSeconds * 1000
    }))

    return {
      durationMs,
      fingerprint: await sha256(source),
      audio: { path: audioPath, format: 'wav' },
      frames
    }
  }
}
