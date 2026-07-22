import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import {
  AuthorizedMediaPreparer,
  AuthorizedMediaService,
  AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID,
  type MediaProbe,
  type ProbedMedia
} from '../src/media/authorized-media.js'

const ITEM_ID = '7664748624454192393'
const SECOND_ITEM_ID = '7659728419487337747'
const BATCH_ID = 'douyin-authorized-test-01'
const SOURCE_BYTES = Buffer.from('authorized-source-video')
const SECOND_SOURCE_BYTES = Buffer.from('second-authorized-source-video')
const DERIVATIVE_BYTES = Buffer.from('browser-compatible-video')
const POSTER_BYTES = Buffer.from('jpeg-poster')

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

const fakeProbe: MediaProbe = {
  async probe(filePath: string): Promise<ProbedMedia> {
    const isSource = filePath.includes(`${path.sep}authorized-douyin${path.sep}`)
    return {
      durationSeconds: 10.25,
      videoCodec: isSource ? 'hevc' : 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920,
      pixelFormat: isSource ? undefined : 'yuv420p'
    }
  }
}

interface FixtureOptions {
  retentionUntil?: string
  sourceSha256?: string
  sourceRelativePath?: string
  duplicateItem?: boolean
  includeSource?: boolean
  includePreparedManifest?: boolean
  includeDerivative?: boolean
  includePoster?: boolean
  includeSecondItem?: boolean
  schemaVersion?: 1 | 2
  includeUnmappedItem?: boolean
}

const cleanupRoots: string[] = []

async function createFixture(options: FixtureOptions = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'caibao-authorized-media-'))
  cleanupRoots.push(root)
  const importDir = path.join(root, 'media-import', 'authorized-douyin')
  const preparedRoot = path.join(root, '.analysis-work', 'authorized-media')
  const batchDir = path.join(preparedRoot, BATCH_ID)
  const sourceRelativePath = options.sourceRelativePath ?? `${ITEM_ID}.mp4`
  const sourcePath = path.resolve(importDir, sourceRelativePath)
  const derivativeRelativePath = `video/${ITEM_ID}.mp4`
  const posterRelativePath = `poster/${ITEM_ID}.jpg`
  const derivativePath = path.join(batchDir, derivativeRelativePath)
  const posterPath = path.join(batchDir, posterRelativePath)

  await mkdir(importDir, { recursive: true })
  if (options.includeSource !== false && sourcePath.startsWith(importDir)) {
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, SOURCE_BYTES)
  }

  const item = {
    itemId: ITEM_ID,
    sourceUrl: `https://www.douyin.com/video/${ITEM_ID}`,
    author: '小Lin说',
    title: '测试授权视频',
    publishedAtObserved: '2026-07-21 06:59',
    aiGeneratedDisclosureObserved: false,
    relativePath: sourceRelativePath,
    mimeType: 'video/mp4',
    videoCodec: 'hevc',
    audioCodec: 'aac',
    width: 1080,
    height: 1920,
    durationSeconds: 10.25,
    bytes: SOURCE_BYTES.byteLength,
    sha256: options.sourceSha256 ?? sha256(SOURCE_BYTES)
  }
  const secondItem = {
    ...item,
    itemId: SECOND_ITEM_ID,
    sourceUrl: `https://www.douyin.com/video/${SECOND_ITEM_ID}`,
    title: '第二条测试授权视频',
    relativePath: `${SECOND_ITEM_ID}.mp4`,
    bytes: SECOND_SOURCE_BYTES.byteLength,
    sha256: sha256(SECOND_SOURCE_BYTES)
  }
  if (options.includeSecondItem && options.includeSource !== false) {
    await writeFile(path.join(importDir, secondItem.relativePath), SECOND_SOURCE_BYTES)
  }
  const mappedManifestItems = options.includeSecondItem ? [item, secondItem] : [item]
  const unmappedItem = {
    ...item,
    itemId: '7000000000000000000',
    sourceUrl: 'https://www.douyin.com/video/7000000000000000000',
    relativePath: '7000000000000000000.mp4'
  }
  const manifestItems = options.includeUnmappedItem
    ? [...mappedManifestItems, unmappedItem]
    : mappedManifestItems
  let manifest: Record<string, unknown> = {
    schemaVersion: 1,
    batchId: BATCH_ID,
    createdAt: '2026-07-23T00:21:16+08:00',
    rights: {
      status: 'authorized',
      authorizedSubject: 'current_operator_attested',
      attestationId: 'operator-chat-test',
      purpose: '财经推演室内部 PoC',
      retentionUntil: options.retentionUntil ?? '2099-08-22'
    },
    collectionPolicy: {
      maxItems: 4,
      commentsCollected: false,
      likesOrFavoritesCollected: false,
      cookiesReadCopiedOrLogged: false,
      captchaEncountered: false,
      reverseSignatureGeneratedByProject: false,
      temporarySourceUrlsPersisted: false,
      mediaHandling: 'test fixture'
    },
    items: options.duplicateItem ? [item, { ...item }] : manifestItems
  }
  if (options.schemaVersion === 2) {
    const v2Items = manifestItems.map(
      ({ mimeType: _mimeType, videoCodec: _videoCodec, audioCodec: _audioCodec, ...entry }) => entry
    )
    manifest = {
      schemaVersion: 2,
      batchId: BATCH_ID,
      createdAt: '2026-07-23T00:21:16+08:00',
      finalizedAt: '2026-07-23T03:00:00+08:00',
      authors: [
        {
          name: '小Lin说',
          secUid: 'test-sec-uid',
          itemCount: v2Items.length,
          contentType: '财经科普'
        }
      ],
      rights: {
        status: 'authorized',
        authorizationBasis: 'user_attested_test',
        authorizedSubject: 'current_operator_attested',
        attestationId: 'operator-chat-test',
        verificationStatus: 'user_attested_not_independently_verified',
        purpose: '财经推演室内部 PoC',
        retentionUntil: options.retentionUntil ?? '2099-08-22'
      },
      collectionPolicy: {
        requestedCreatorLimit: 15,
        completedItems: v2Items.length,
        stoppedAtUserRequest: true,
        commentsCollected: false,
        likesOrFavoritesCollected: false,
        cookiesReadCopiedOrLogged: false,
        captchaEncountered: false,
        reverseSignatureGeneratedByProject: false,
        temporarySourceUrlsPersisted: false,
        commonMediaFormat: 'MP4 container; HEVC video + AAC audio',
        mediaHandling: 'test fixture',
        comments: {
          status: 'oauth_scope_required',
          transport: 'Douyin Open Platform only',
          requiredScopes: ['item.comment'],
          plannedLimitPerVideo: 20,
          topLevelOnly: true,
          excludedFields: ['userId']
        },
        mockCommentAssets: {
          provenance: 'llm_generated_mock_confirmed_by_user',
          fileCount: 0,
          recordCount: 0,
          usage: 'UI demo only',
          realPlatformComments: false,
          includedInAuthorizedCollection: false
        }
      },
      items: v2Items
    }
  }
  const manifestPath = path.join(importDir, 'download-manifest.json')
  await writeFile(manifestPath, JSON.stringify(manifest))

  if (options.includePreparedManifest !== false) {
    await mkdir(path.dirname(derivativePath), { recursive: true })
    await mkdir(path.dirname(posterPath), { recursive: true })
    if (options.includeDerivative !== false) await writeFile(derivativePath, DERIVATIVE_BYTES)
    if (options.includePoster !== false) await writeFile(posterPath, POSTER_BYTES)
    const preparedManifest = {
      schemaVersion: 1,
      batchId: BATCH_ID,
      preparedAt: '2026-07-23T01:00:00.000Z',
      items: [
        {
          itemId: ITEM_ID,
          sourceSha256: sha256(SOURCE_BYTES),
          video: {
            relativePath: derivativeRelativePath,
            mimeType: 'video/mp4',
            videoCodec: 'h264',
            audioCodec: 'aac',
            pixelFormat: 'yuv420p',
            width: 1080,
            height: 1920,
            durationSeconds: 10.25,
            bytes: DERIVATIVE_BYTES.byteLength,
            sha256: sha256(DERIVATIVE_BYTES)
          },
          poster: {
            relativePath: posterRelativePath,
            mimeType: 'image/jpeg',
            bytes: POSTER_BYTES.byteLength,
            sha256: sha256(POSTER_BYTES)
          }
        }
      ]
    }
    await writeFile(path.join(batchDir, 'prepared-manifest.json'), JSON.stringify(preparedManifest))
  }

  const service = new AuthorizedMediaService({
    manifestPath,
    preparedRoot,
    probe: fakeProbe,
    now: () => new Date('2026-07-23T00:00:00.000Z')
  })
  return { service, manifestPath, sourcePath, derivativePath, posterPath, preparedRoot }
}

afterEach(async () => {
  await Promise.all(
    cleanupRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('AuthorizedMediaService', () => {
  it('maps every showcase video to its deterministic finance experience', () => {
    expect(Object.keys(AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID)).toHaveLength(25)
    expect(AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID[ITEM_ID]).toBe(`finance-showcase-${ITEM_ID}`)
  })

  it('returns only fully verified allowlisted media without leaking local paths', async () => {
    const { service } = await createFixture()

    const catalog = await service.refresh()

    expect(catalog).toMatchObject({
      batchId: BATCH_ID,
      status: 'ready',
      total: 1,
      exclusions: [],
      items: [
        {
          videoId: ITEM_ID,
          author: '小Lin说',
          durationMs: 10_250,
          sourceSha256: sha256(SOURCE_BYTES),
          derivativeSha256: sha256(DERIVATIVE_BYTES),
          financeExperienceId: `finance-showcase-${ITEM_ID}`,
          mediaUrl: `/api/finance/v1/media/${ITEM_ID}/video`,
          posterUrl: `/api/finance/v1/media/${ITEM_ID}/poster`
        }
      ]
    })
    expect(JSON.stringify(catalog)).not.toMatch(
      /caibao-authorized-media-|\.analysis-work|media-import/
    )
  })

  it('accepts manifest v2 while excluding every unmapped video from the catalog', async () => {
    const { service } = await createFixture({ schemaVersion: 2, includeUnmappedItem: true })

    const catalog = await service.refresh()

    expect(catalog.status).toBe('ready')
    expect(catalog.items.map((entry) => entry.videoId)).toEqual([ITEM_ID])
    expect(catalog.exclusions).toContainEqual({
      videoId: '7000000000000000000',
      code: 'AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED',
      reason: 'Authorized media has no reviewed finance experience mapping'
    })
  })

  it('fails the whole manifest closed when video ids are duplicated', async () => {
    const { service } = await createFixture({ duplicateItem: true })

    await expect(service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      items: [],
      exclusions: [{ code: 'MANIFEST_DUPLICATE_VIDEO_ID' }]
    })
  })

  it('rejects a manifest whose rights are not explicitly authorized', async () => {
    const fixture = await createFixture()
    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'))
    manifest.rights.status = 'pending'
    await writeFile(fixture.manifestPath, JSON.stringify(manifest))

    await expect(fixture.service.refresh()).resolves.toMatchObject({
      batchId: null,
      status: 'invalid',
      total: 0,
      exclusions: [{ code: 'MANIFEST_INVALID' }]
    })
  })

  it('rejects a source path that traverses outside the manifest directory', async () => {
    const { service } = await createFixture({ sourceRelativePath: '../outside.mp4' })

    await expect(service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [{ videoId: ITEM_ID, code: 'MEDIA_PATH_OUTSIDE_ALLOWLIST_ROOT' }]
    })
  })

  it('marks rights as expired and refuses a formerly known id with 410', async () => {
    const fixture = await createFixture({ retentionUntil: '2026-07-22' })
    const service = new AuthorizedMediaService({
      manifestPath: fixture.manifestPath,
      preparedRoot: fixture.preparedRoot,
      probe: fakeProbe,
      now: () => new Date('2026-07-23T00:00:00.000Z')
    })

    await expect(service.refresh()).resolves.toMatchObject({ status: 'expired', total: 0 })
    await expect(service.resolveAsset(ITEM_ID, 'video')).rejects.toMatchObject({
      code: 'AUTHORIZED_MEDIA_RIGHTS_EXPIRED',
      status: 410
    })
  })

  it('expires at the end of the retention date in Asia/Shanghai', async () => {
    const atBoundary = await createFixture({ retentionUntil: '2026-07-22' })
    const stillValid = new AuthorizedMediaService({
      manifestPath: atBoundary.manifestPath,
      preparedRoot: atBoundary.preparedRoot,
      probe: fakeProbe,
      now: () => new Date('2026-07-22T15:59:59.999Z')
    })
    await expect(stillValid.refresh()).resolves.toMatchObject({
      status: 'ready',
      expiresAt: '2026-07-22T23:59:59.999+08:00'
    })

    const afterBoundary = await createFixture({ retentionUntil: '2026-07-22' })
    const expired = new AuthorizedMediaService({
      manifestPath: afterBoundary.manifestPath,
      preparedRoot: afterBoundary.preparedRoot,
      probe: fakeProbe,
      now: () => new Date('2026-07-22T16:00:00.000Z')
    })
    await expect(expired.refresh()).resolves.toMatchObject({ status: 'expired', total: 0 })
  })

  it('excludes missing and hash-mismatched source files instead of falling back', async () => {
    const missing = await createFixture({ includeSource: false })
    await expect(missing.service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [{ videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_SOURCE_MISSING' }]
    })

    const mismatch = await createFixture({ sourceSha256: '0'.repeat(64) })
    await expect(mismatch.service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [{ videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_SOURCE_HASH_MISMATCH' }]
    })
  })

  it('rejects byte and ffprobe metadata mismatches', async () => {
    const bytesMismatch = await createFixture()
    const manifest = JSON.parse(await readFile(bytesMismatch.manifestPath, 'utf8'))
    manifest.items[0].bytes += 1
    await writeFile(bytesMismatch.manifestPath, JSON.stringify(manifest))
    await expect(bytesMismatch.service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      exclusions: [{ videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_SOURCE_SIZE_MISMATCH' }]
    })

    const probeMismatch = await createFixture()
    const service = new AuthorizedMediaService({
      manifestPath: probeMismatch.manifestPath,
      preparedRoot: probeMismatch.preparedRoot,
      probe: {
        probe: async () => ({ ...((await fakeProbe.probe('source')) as ProbedMedia), width: 720 })
      },
      now: () => new Date('2026-07-23T00:00:00.000Z')
    })
    await expect(service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      exclusions: [{ videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_SOURCE_METADATA_MISMATCH' }]
    })
  })

  it('uses derivative_missing when sources are valid but prepared files are absent', async () => {
    const { service } = await createFixture({
      includePreparedManifest: false,
      schemaVersion: 2,
      includeUnmappedItem: true
    })

    const catalog = await service.refresh()
    expect(catalog).toMatchObject({ status: 'derivative_missing', total: 0 })
    expect(catalog.exclusions).toEqual(
      expect.arrayContaining([
        {
          videoId: ITEM_ID,
          code: 'AUTHORIZED_MEDIA_DERIVATIVE_MISSING',
          reason: expect.any(String)
        },
        {
          videoId: '7000000000000000000',
          code: 'AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED',
          reason: expect.any(String)
        }
      ])
    )
  })

  it('treats corrupt derivative integrity data as invalid, never as a usable fallback', async () => {
    const fixture = await createFixture()
    const preparedManifestPath = path.join(fixture.preparedRoot, BATCH_ID, 'prepared-manifest.json')
    const prepared = JSON.parse(await readFile(preparedManifestPath, 'utf8'))
    prepared.items[0].video.sha256 = '0'.repeat(64)
    await writeFile(preparedManifestPath, JSON.stringify(prepared))

    await expect(fixture.service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [{ videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_DERIVATIVE_INVALID' }]
    })
  })

  it('invalidates a cached ready catalog when its source file or rights manifest changes', async () => {
    const sourceFixture = await createFixture()
    await expect(sourceFixture.service.getCatalog()).resolves.toMatchObject({
      status: 'ready',
      total: 1
    })
    await unlink(sourceFixture.sourcePath)
    await expect(sourceFixture.service.getCatalog()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [
        { videoId: ITEM_ID, code: 'AUTHORIZED_MEDIA_SOURCE_MISSING', reason: expect.any(String) }
      ]
    })

    const rightsFixture = await createFixture()
    await expect(rightsFixture.service.getCatalog()).resolves.toMatchObject({ status: 'ready' })
    const manifest = JSON.parse(await readFile(rightsFixture.manifestPath, 'utf8'))
    manifest.rights.retentionUntil = '2026-07-22'
    await writeFile(rightsFixture.manifestPath, `${JSON.stringify(manifest)}\n`)
    await expect(rightsFixture.service.getCatalog()).resolves.toMatchObject({
      status: 'expired',
      total: 0
    })
  })

  it('rejects a prepared batch symlink that resolves outside its allowlist root', async () => {
    const fixture = await createFixture()
    const batchDirectory = path.join(fixture.preparedRoot, BATCH_ID)
    const outsideDirectory = path.join(path.dirname(fixture.preparedRoot), 'outside-prepared-batch')
    await rename(batchDirectory, outsideDirectory)
    await symlink(outsideDirectory, batchDirectory, 'dir')

    await expect(fixture.service.refresh()).resolves.toMatchObject({
      status: 'invalid',
      total: 0,
      exclusions: [{ code: 'AUTHORIZED_MEDIA_PREPARED_PATH_OUTSIDE_ROOT' }]
    })
  })

  it('keeps a prepared manifest with a missing item fail-closed for that video', async () => {
    const fixture = await createFixture({ includeSecondItem: true })

    await expect(fixture.service.refresh()).resolves.toMatchObject({
      status: 'ready',
      total: 1,
      exclusions: [{ videoId: SECOND_ITEM_ID, code: 'AUTHORIZED_MEDIA_DERIVATIVE_MISSING' }]
    })
    await expect(fixture.service.resolveAsset(SECOND_ITEM_ID, 'video')).rejects.toMatchObject({
      code: 'AUTHORIZED_MEDIA_NOT_AVAILABLE',
      status: 404
    })
  })
})

describe('AuthorizedMediaPreparer', () => {
  it('creates H.264 fast-start video, poster and an integrity manifest under the work root', async () => {
    const fixture = await createFixture({
      includePreparedManifest: false,
      schemaVersion: 2,
      includeUnmappedItem: true
    })
    const invocations: string[][] = []
    const preparer = new AuthorizedMediaPreparer({
      manifestPath: fixture.manifestPath,
      preparedRoot: fixture.preparedRoot,
      probe: fakeProbe,
      now: () => new Date('2026-07-23T01:00:00.000Z'),
      runner: {
        async run(_command, args) {
          invocations.push(args)
          const output = args.at(-1)
          if (!output) throw new Error('missing output')
          await writeFile(output, output.endsWith('.jpg') ? POSTER_BYTES : DERIVATIVE_BYTES)
          return { stdout: '', stderr: '' }
        }
      }
    })

    const result = await preparer.prepare()

    expect(result).toMatchObject({ batchId: BATCH_ID, itemCount: 1 })
    expect(result.outputDirectory.startsWith(path.resolve(fixture.preparedRoot))).toBe(true)
    expect(invocations[0]).toEqual(
      expect.arrayContaining(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    )
    expect(invocations[1]).toEqual(expect.arrayContaining(['-frames:v', '1']))
    const prepared = JSON.parse(
      await readFile(path.join(result.outputDirectory, 'prepared-manifest.json'), 'utf8')
    )
    expect(prepared.items[0]).toMatchObject({
      itemId: ITEM_ID,
      sourceSha256: sha256(SOURCE_BYTES),
      video: { videoCodec: 'h264', pixelFormat: 'yuv420p', sha256: sha256(DERIVATIVE_BYTES) },
      poster: { sha256: sha256(POSTER_BYTES) }
    })
  })
})

function createTestApp(authorizedMedia: AuthorizedMediaService) {
  return createApp({
    providerReadiness: () => ({ provider: 'minimax', ready: false, missing: [] }),
    analysisInputReadiness: () => ({
      ready: false,
      asr: { enabled: false, ready: false, missing: [] },
      ocr: { enabled: false, ready: true, missing: [] }
    }),
    mediaReadiness: async () => ({ ready: true, missing: [] }),
    profileProbe: { probe: async () => ({ status: 'dynamic_page_blocked' }) },
    authorizedMedia
  } as never)
}

describe('authorized media HTTP API', () => {
  it('serves catalog plus complete, HEAD and single-range video responses', async () => {
    const { service } = await createFixture()
    const app = createTestApp(service)

    await request(app)
      .get('/api/finance/v1/media/catalog')
      .expect(200)
      .expect('Cache-Control', 'private, no-store')
      .expect(({ body }) => {
        expect(body.status).toBe('ready')
        expect(body.total).toBe(1)
      })

    const complete = await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .expect(200)
      .expect('Accept-Ranges', 'bytes')
      .expect('Cache-Control', 'private, no-store')
      .expect('Content-Type', /video\/mp4/)
    expect(complete.body).toEqual(DERIVATIVE_BYTES)

    await request(app)
      .head(`/api/finance/v1/media/${ITEM_ID}/video`)
      .expect(200)
      .expect('Content-Length', String(DERIVATIVE_BYTES.byteLength))

    await request(app)
      .head(`/api/finance/v1/media/${ITEM_ID}/poster`)
      .expect(200)
      .expect('Content-Length', String(POSTER_BYTES.byteLength))

    const partial = await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .set('Range', 'bytes=2-8')
      .expect(206)
      .expect('Content-Range', `bytes 2-8/${DERIVATIVE_BYTES.byteLength}`)
      .expect('Content-Length', '7')
    expect(partial.body).toEqual(DERIVATIVE_BYTES.subarray(2, 9))

    const suffix = await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .set('Range', 'bytes=-5')
      .expect(206)
      .expect(
        'Content-Range',
        `bytes ${DERIVATIVE_BYTES.byteLength - 5}-${DERIVATIVE_BYTES.byteLength - 1}/${DERIVATIVE_BYTES.byteLength}`
      )
    expect(suffix.body).toEqual(DERIVATIVE_BYTES.subarray(-5))
  })

  it('returns 416 for invalid ranges, 404 for unknown ids, and never maps another file', async () => {
    const { service } = await createFixture()
    const app = createTestApp(service)

    await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .set('Range', `bytes=${DERIVATIVE_BYTES.byteLength}-`)
      .expect(416)
      .expect('Content-Range', `bytes */${DERIVATIVE_BYTES.byteLength}`)

    await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .set('Range', 'bytes=0-1,3-4')
      .expect(416)
      .expect('Content-Range', `bytes */${DERIVATIVE_BYTES.byteLength}`)

    const unknown = await request(app)
      .get('/api/finance/v1/media/0000000000000000000/video')
      .expect(404)
    expect(unknown.body.error.code).toBe('AUTHORIZED_MEDIA_NOT_FOUND')
  })

  it('returns 410 for expired allowlisted media', async () => {
    const fixture = await createFixture({ retentionUntil: '2026-07-22' })
    const service = new AuthorizedMediaService({
      manifestPath: fixture.manifestPath,
      preparedRoot: fixture.preparedRoot,
      probe: fakeProbe,
      now: () => new Date('2026-07-23T00:00:00.000Z')
    })
    const response = await request(createTestApp(service))
      .get(`/api/finance/v1/media/${ITEM_ID}/video`)
      .expect(410)
    expect(response.body.error.code).toBe('AUTHORIZED_MEDIA_RIGHTS_EXPIRED')
  })

  it('serves only the verified poster from the allowlist', async () => {
    const { service, posterPath } = await createFixture()
    const app = createTestApp(service)

    const response = await request(app)
      .get(`/api/finance/v1/media/${ITEM_ID}/poster`)
      .expect(200)
      .expect('Content-Type', /image\/jpeg/)
    expect(response.body).toEqual(await readFile(posterPath))

    await unlink(posterPath)
    await request(app).get(`/api/finance/v1/media/${ITEM_ID}/poster`).expect(404)
  })
})
