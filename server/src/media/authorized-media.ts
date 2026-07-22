import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { AppError } from '../domain/errors.js'
import { SHOWCASE_EXPERIENCE_BY_VIDEO_ID } from '../showcase/content-seeds.js'
import { NodeCommandRunner, type CommandRunner } from './ffmpeg.js'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const safeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)
const retentionDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T23:59:59.999+08:00`)))

const mediaItemSchema = z
  .object({
    itemId: safeIdSchema,
    sourceUrl: z.string().url(),
    author: z.string().min(1).max(200),
    title: z.string().min(1).max(1_000),
    publishedAtObserved: z.string().min(1).max(100),
    aiGeneratedDisclosureObserved: z.boolean(),
    relativePath: z.string().min(1).max(500),
    mimeType: z.literal('video/mp4').default('video/mp4'),
    videoCodec: z.string().min(1).default('hevc'),
    audioCodec: z.string().min(1).default('aac'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    bytes: z.number().int().positive(),
    sha256: sha256Schema
  })
  .strict()

const rawDownloadManifestSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    batchId: safeIdSchema,
    createdAt: z.string().datetime({ offset: true }),
    finalizedAt: z.string().datetime({ offset: true }).optional(),
    authors: z
      .array(
        z
          .object({
            name: z.string().min(1),
            secUid: z.string().min(1),
            itemCount: z.number().int().nonnegative(),
            contentType: z.string().min(1),
            editorialReviewRequired: z.boolean().optional()
          })
          .strict()
      )
      .optional(),
    rights: z
      .object({
        status: z.literal('authorized'),
        authorizationBasis: z.string().min(1).optional(),
        authorizedSubject: z.string().min(1),
        attestationId: z.string().min(1),
        verificationStatus: z.string().min(1).optional(),
        purpose: z.string().min(1),
        retentionUntil: retentionDateSchema
      })
      .strict(),
    collectionPolicy: z
      .object({
        maxItems: z.number().int().positive().max(100).optional(),
        requestedCreatorLimit: z.number().int().positive().max(100).optional(),
        completedItems: z.number().int().positive().max(100).optional(),
        stoppedAtUserRequest: z.boolean().optional(),
        commentsCollected: z.boolean(),
        likesOrFavoritesCollected: z.boolean(),
        cookiesReadCopiedOrLogged: z.boolean(),
        captchaEncountered: z.boolean(),
        reverseSignatureGeneratedByProject: z.boolean(),
        temporarySourceUrlsPersisted: z.boolean(),
        commonMediaFormat: z.string().min(1).optional(),
        mediaHandling: z.string().min(1),
        comments: z
          .object({
            status: z.string().min(1),
            transport: z.string().min(1),
            requiredScopes: z.array(z.string().min(1)),
            plannedLimitPerVideo: z.number().int().nonnegative(),
            topLevelOnly: z.boolean(),
            excludedFields: z.array(z.string().min(1))
          })
          .strict()
          .optional(),
        mockCommentAssets: z
          .object({
            provenance: z.string().min(1),
            fileCount: z.number().int().nonnegative(),
            recordCount: z.number().int().nonnegative(),
            usage: z.string().min(1),
            realPlatformComments: z.boolean(),
            includedInAuthorizedCollection: z.boolean()
          })
          .strict()
          .optional()
      })
      .strict(),
    items: z.array(mediaItemSchema).min(1).max(100)
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.schemaVersion === 1) {
      if (!manifest.collectionPolicy.maxItems) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Manifest v1 requires collectionPolicy.maxItems',
          path: ['collectionPolicy', 'maxItems']
        })
      }
      return
    }

    if (
      !manifest.finalizedAt ||
      !manifest.authors?.length ||
      !manifest.rights.authorizationBasis ||
      !manifest.rights.verificationStatus ||
      !manifest.collectionPolicy.completedItems ||
      !manifest.collectionPolicy.commonMediaFormat
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manifest v2 audit fields are incomplete'
      })
    }
    if (manifest.collectionPolicy.completedItems !== manifest.items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manifest v2 completedItems must equal items.length',
        path: ['collectionPolicy', 'completedItems']
      })
    }
    if (!/HEVC.*AAC/i.test(manifest.collectionPolicy.commonMediaFormat ?? '')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Manifest v2 must declare the expected HEVC/AAC source format',
        path: ['collectionPolicy', 'commonMediaFormat']
      })
    }
  })

const downloadManifestSchema = rawDownloadManifestSchema.transform((manifest) => ({
  schemaVersion: manifest.schemaVersion,
  batchId: manifest.batchId,
  createdAt: manifest.createdAt,
  rights: {
    status: manifest.rights.status,
    authorizedSubject: manifest.rights.authorizedSubject,
    attestationId: manifest.rights.attestationId,
    purpose: manifest.rights.purpose,
    retentionUntil: manifest.rights.retentionUntil
  },
  collectionPolicy: {
    maxItems:
      manifest.schemaVersion === 1
        ? (manifest.collectionPolicy.maxItems as number)
        : (manifest.collectionPolicy.completedItems as number),
    commentsCollected: manifest.collectionPolicy.commentsCollected,
    likesOrFavoritesCollected: manifest.collectionPolicy.likesOrFavoritesCollected,
    cookiesReadCopiedOrLogged: manifest.collectionPolicy.cookiesReadCopiedOrLogged,
    captchaEncountered: manifest.collectionPolicy.captchaEncountered,
    reverseSignatureGeneratedByProject:
      manifest.collectionPolicy.reverseSignatureGeneratedByProject,
    temporarySourceUrlsPersisted: manifest.collectionPolicy.temporarySourceUrlsPersisted,
    mediaHandling: manifest.collectionPolicy.mediaHandling
  },
  items: manifest.items
}))

const preparedAssetSchema = z
  .object({
    relativePath: z.string().min(1).max(500),
    mimeType: z.string().min(1),
    bytes: z.number().int().positive(),
    sha256: sha256Schema
  })
  .strict()

const preparedVideoSchema = preparedAssetSchema.extend({
  mimeType: z.literal('video/mp4'),
  videoCodec: z.literal('h264'),
  audioCodec: z.literal('aac'),
  pixelFormat: z.literal('yuv420p'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive()
})

const preparedManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    batchId: safeIdSchema,
    preparedAt: z.string().datetime(),
    items: z
      .array(
        z
          .object({
            itemId: safeIdSchema,
            sourceSha256: sha256Schema,
            video: preparedVideoSchema,
            poster: preparedAssetSchema.extend({ mimeType: z.literal('image/jpeg') })
          })
          .strict()
      )
      .min(1)
  })
  .strict()

type DownloadManifest = z.infer<typeof downloadManifestSchema>
type DownloadManifestItem = z.infer<typeof mediaItemSchema>
type PreparedManifest = z.infer<typeof preparedManifestSchema>

export interface ProbedMedia {
  durationSeconds: number
  videoCodec: string
  audioCodec?: string
  width: number
  height: number
  pixelFormat?: string
}

export interface MediaProbe {
  probe(filePath: string): Promise<ProbedMedia>
}

export class FfprobeMediaProbe implements MediaProbe {
  private readonly runner: CommandRunner

  constructor(
    private readonly ffprobePath = 'ffprobe',
    runner?: CommandRunner
  ) {
    this.runner = runner ?? new NodeCommandRunner()
  }

  async probe(filePath: string): Promise<ProbedMedia> {
    const result = await this.runner.run(this.ffprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,pix_fmt',
      '-of',
      'json',
      filePath
    ])
    try {
      const parsed = JSON.parse(result.stdout) as {
        format?: { duration?: string | number }
        streams?: Array<{
          codec_type?: string
          codec_name?: string
          width?: number
          height?: number
          pix_fmt?: string
        }>
      }
      const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
      const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
      const probe: ProbedMedia = {
        durationSeconds: Number(parsed.format?.duration),
        videoCodec: video?.codec_name ?? '',
        audioCodec: audio?.codec_name,
        width: Number(video?.width),
        height: Number(video?.height),
        pixelFormat: video?.pix_fmt
      }
      if (
        !Number.isFinite(probe.durationSeconds) ||
        probe.durationSeconds <= 0 ||
        !probe.videoCodec ||
        !Number.isInteger(probe.width) ||
        probe.width <= 0 ||
        !Number.isInteger(probe.height) ||
        probe.height <= 0
      ) {
        throw new Error('Required video metadata is missing')
      }
      return probe
    } catch (error) {
      throw new AppError(
        'AUTHORIZED_MEDIA_PROBE_INVALID',
        'FFprobe returned invalid media metadata',
        {
          status: 422,
          cause: error
        }
      )
    }
  }
}

export interface AuthorizedMediaCatalogItem {
  videoId: string
  title: string
  author: string
  publishedAtObserved: string
  aiGeneratedDisclosureObserved: boolean
  durationMs: number
  width: number
  height: number
  sourceSha256: string
  derivativeSha256: string
  mediaUrl: string
  posterUrl: string
  financeExperienceId: string
}

export interface AuthorizedMediaExclusion {
  videoId?: string
  code: string
  reason: string
}

export interface AuthorizedMediaCatalog {
  batchId: string | null
  status: 'ready' | 'expired' | 'invalid' | 'derivative_missing'
  expiresAt: string | null
  total: number
  items: AuthorizedMediaCatalogItem[]
  exclusions: AuthorizedMediaExclusion[]
}

export interface ResolvedAuthorizedAsset {
  filePath: string
  bytes: number
  mimeType: 'video/mp4' | 'image/jpeg'
  sha256: string
  modifiedTimeMs: number
  inode: number
}

interface ValidSource {
  item: DownloadManifestItem
  filePath: string
  bytes: number
  modifiedTimeMs: number
  inode: number
}

interface ManifestInspection {
  manifest: DownloadManifest | null
  validSources: Map<string, ValidSource>
  knownIds: Set<string>
  expired: boolean
  expiresAt: string | null
  exclusions: AuthorizedMediaExclusion[]
}

interface PreparedInternalItem {
  publicItem: AuthorizedMediaCatalogItem
  source: ValidSource
  video: ResolvedAuthorizedAsset
  poster: ResolvedAuthorizedAsset
}

interface FileIdentity {
  filePath: string
  bytes: number
  modifiedTimeMs: number
  inode: number
}

export const AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID: Readonly<Record<string, string>> =
  SHOWCASE_EXPERIENCE_BY_VIDEO_ID

function exclusion(code: string, reason: string, videoId?: string): AuthorizedMediaExclusion {
  return { ...(videoId ? { videoId } : {}), code, reason }
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function captureFileIdentity(filePath: string): Promise<FileIdentity | null> {
  try {
    const current = await stat(filePath)
    if (!current.isFile()) return null
    return {
      filePath,
      bytes: current.size,
      modifiedTimeMs: current.mtimeMs,
      inode: current.ino
    }
  } catch {
    return null
  }
}

async function fileIdentityMatches(expected: FileIdentity | null): Promise<boolean> {
  if (!expected) return false
  const current = await captureFileIdentity(expected.filePath)
  return Boolean(
    current &&
      current.bytes === expected.bytes &&
      current.modifiedTimeMs === expected.modifiedTimeMs &&
      current.inode === expected.inode
  )
}

function expiresAt(retentionUntil: string): string {
  return `${retentionUntil}T23:59:59.999+08:00`
}

async function digestFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

function metadataMatches(
  actual: ProbedMedia,
  expected: {
    durationSeconds: number
    videoCodec: string
    audioCodec?: string
    width: number
    height: number
    pixelFormat?: string
  }
): boolean {
  return (
    Math.abs(actual.durationSeconds - expected.durationSeconds) <= 0.25 &&
    actual.videoCodec.toLowerCase() === expected.videoCodec.toLowerCase() &&
    (!expected.audioCodec ||
      actual.audioCodec?.toLowerCase() === expected.audioCodec.toLowerCase()) &&
    actual.width === expected.width &&
    actual.height === expected.height &&
    (!expected.pixelFormat || actual.pixelFormat === expected.pixelFormat)
  )
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function inspectManifest(options: {
  manifestPath: string
  probe: MediaProbe
  now: () => Date
}): Promise<ManifestInspection> {
  let manifest: DownloadManifest
  try {
    manifest = downloadManifestSchema.parse(await readJson(options.manifestPath))
  } catch {
    return {
      manifest: null,
      validSources: new Map(),
      knownIds: new Set(),
      expired: false,
      expiresAt: null,
      exclusions: [exclusion('MANIFEST_INVALID', 'Authorized media manifest is missing or invalid')]
    }
  }

  const knownIds = new Set(manifest.items.map((item) => item.itemId))
  if (knownIds.size !== manifest.items.length) {
    return {
      manifest,
      validSources: new Map(),
      knownIds,
      expired: false,
      expiresAt: expiresAt(manifest.rights.retentionUntil),
      exclusions: [
        exclusion('MANIFEST_DUPLICATE_VIDEO_ID', 'Authorized media manifest contains duplicate ids')
      ]
    }
  }
  if (manifest.items.length > manifest.collectionPolicy.maxItems) {
    return {
      manifest,
      validSources: new Map(),
      knownIds,
      expired: false,
      expiresAt: expiresAt(manifest.rights.retentionUntil),
      exclusions: [
        exclusion(
          'MANIFEST_ITEM_LIMIT_EXCEEDED',
          'Authorized media manifest exceeds its item limit'
        )
      ]
    }
  }

  const rightsExpiresAt = expiresAt(manifest.rights.retentionUntil)
  if (options.now().getTime() > Date.parse(rightsExpiresAt)) {
    return {
      manifest,
      validSources: new Map(),
      knownIds,
      expired: true,
      expiresAt: rightsExpiresAt,
      exclusions: [
        exclusion('AUTHORIZED_MEDIA_RIGHTS_EXPIRED', 'Authorized media rights have expired')
      ]
    }
  }

  const importRoot = path.resolve(path.dirname(options.manifestPath))
  let realImportRoot: string
  try {
    realImportRoot = await realpath(importRoot)
  } catch {
    return {
      manifest,
      validSources: new Map(),
      knownIds,
      expired: false,
      expiresAt: rightsExpiresAt,
      exclusions: [exclusion('MANIFEST_INVALID', 'Authorized media root is unavailable')]
    }
  }

  const validSources = new Map<string, ValidSource>()
  const exclusions: AuthorizedMediaExclusion[] = []
  for (const item of manifest.items) {
    if (!AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID[item.itemId]) {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED',
          'Authorized media has no reviewed finance experience mapping',
          item.itemId
        )
      )
      continue
    }
    const sourceUrl = new URL(item.sourceUrl)
    if (
      !(sourceUrl.hostname === 'douyin.com' || sourceUrl.hostname.endsWith('.douyin.com')) ||
      sourceUrl.pathname !== `/video/${item.itemId}`
    ) {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_URL_MISMATCH',
          'Authorized media source URL does not match its video id',
          item.itemId
        )
      )
      continue
    }
    const candidate = path.resolve(importRoot, item.relativePath)
    if (path.isAbsolute(item.relativePath) || !isWithin(importRoot, candidate)) {
      exclusions.push(
        exclusion(
          'MEDIA_PATH_OUTSIDE_ALLOWLIST_ROOT',
          'Authorized media path is outside the allowlist root',
          item.itemId
        )
      )
      continue
    }
    let sourcePath: string
    let sourceStat
    try {
      sourcePath = await realpath(candidate)
      sourceStat = await stat(sourcePath)
    } catch {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_MISSING',
          'Authorized media source is missing',
          item.itemId
        )
      )
      continue
    }
    if (!isWithin(realImportRoot, sourcePath) || !sourceStat.isFile()) {
      exclusions.push(
        exclusion(
          'MEDIA_PATH_OUTSIDE_ALLOWLIST_ROOT',
          'Authorized media path resolves outside the allowlist root',
          item.itemId
        )
      )
      continue
    }
    if (sourceStat.size !== item.bytes) {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_SIZE_MISMATCH',
          'Authorized media source size does not match its manifest',
          item.itemId
        )
      )
      continue
    }
    if ((await digestFile(sourcePath)) !== item.sha256) {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_HASH_MISMATCH',
          'Authorized media source fingerprint does not match its manifest',
          item.itemId
        )
      )
      continue
    }
    let probed: ProbedMedia
    try {
      probed = await options.probe.probe(sourcePath)
    } catch {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_PROBE_FAILED',
          'Authorized media source probe failed',
          item.itemId
        )
      )
      continue
    }
    if (!metadataMatches(probed, item)) {
      exclusions.push(
        exclusion(
          'AUTHORIZED_MEDIA_SOURCE_METADATA_MISMATCH',
          'Authorized media source metadata does not match its manifest',
          item.itemId
        )
      )
      continue
    }
    validSources.set(item.itemId, {
      item,
      filePath: sourcePath,
      bytes: sourceStat.size,
      modifiedTimeMs: sourceStat.mtimeMs,
      inode: sourceStat.ino
    })
  }
  return {
    manifest,
    validSources,
    knownIds,
    expired: false,
    expiresAt: rightsExpiresAt,
    exclusions
  }
}

async function verifyPreparedAsset(
  batchRoot: string,
  declared: { relativePath: string; bytes: number; sha256: string; mimeType: string }
): Promise<ResolvedAuthorizedAsset | null> {
  const candidate = path.resolve(batchRoot, declared.relativePath)
  if (path.isAbsolute(declared.relativePath) || !isWithin(batchRoot, candidate)) return null
  try {
    const realBatchRoot = await realpath(batchRoot)
    const filePath = await realpath(candidate)
    const fileStat = await stat(filePath)
    if (
      !isWithin(realBatchRoot, filePath) ||
      !fileStat.isFile() ||
      fileStat.size !== declared.bytes
    ) {
      return null
    }
    if ((await digestFile(filePath)) !== declared.sha256) return null
    return {
      filePath,
      bytes: fileStat.size,
      mimeType: declared.mimeType as 'video/mp4' | 'image/jpeg',
      sha256: declared.sha256,
      modifiedTimeMs: fileStat.mtimeMs,
      inode: fileStat.ino
    }
  } catch {
    return null
  }
}

export class AuthorizedMediaService {
  private readonly probe: MediaProbe
  private readonly now: () => Date
  private catalog: AuthorizedMediaCatalog | null = null
  private assets = new Map<string, PreparedInternalItem>()
  private knownIds = new Set<string>()
  private rightsExpiresAt: string | null = null
  private refreshInFlight: Promise<AuthorizedMediaCatalog> | null = null
  private manifestIdentity: FileIdentity | null = null
  private preparedManifestIdentity: FileIdentity | null = null

  constructor(
    private readonly options: {
      manifestPath: string
      preparedRoot: string
      probe?: MediaProbe
      now?: () => Date
    }
  ) {
    this.probe = options.probe ?? new FfprobeMediaProbe()
    this.now = options.now ?? (() => new Date())
  }

  async refresh(): Promise<AuthorizedMediaCatalog> {
    if (this.refreshInFlight) return this.refreshInFlight
    const pending = this.loadCatalog()
    this.refreshInFlight = pending
    try {
      return await pending
    } finally {
      if (this.refreshInFlight === pending) this.refreshInFlight = null
    }
  }

  private async loadCatalog(): Promise<AuthorizedMediaCatalog> {
    const inspected = await inspectManifest({
      manifestPath: this.options.manifestPath,
      probe: this.probe,
      now: this.now
    })
    this.assets = new Map()
    this.knownIds = inspected.knownIds
    this.rightsExpiresAt = inspected.expiresAt
    this.manifestIdentity = await captureFileIdentity(this.options.manifestPath)
    this.preparedManifestIdentity = null

    if (!inspected.manifest || inspected.expired || inspected.validSources.size === 0) {
      const status = inspected.expired ? 'expired' : 'invalid'
      return (this.catalog = {
        batchId: inspected.manifest?.batchId ?? null,
        status,
        expiresAt: inspected.expiresAt,
        total: 0,
        items: [],
        exclusions: inspected.exclusions
      })
    }

    const preparedRoot = path.resolve(this.options.preparedRoot)
    let batchRoot = path.resolve(preparedRoot, inspected.manifest.batchId)
    let prepared: PreparedManifest | null = null
    let preparedManifestState: 'ready' | 'missing' | 'invalid' = 'ready'
    let preparedManifestInvalidCode = 'AUTHORIZED_MEDIA_PREPARED_MANIFEST_INVALID'
    let preparedManifestInvalidReason = 'Prepared media manifest failed validation'
    try {
      const realPreparedRoot = await realpath(preparedRoot)
      const realBatchRoot = await realpath(batchRoot)
      if (!isWithin(realPreparedRoot, realBatchRoot)) {
        throw new AppError(
          'AUTHORIZED_MEDIA_PREPARED_PATH_OUTSIDE_ROOT',
          'Prepared media batch resolves outside its allowlist root',
          { status: 403 }
        )
      }
      batchRoot = realBatchRoot
      const preparedManifestPath = path.join(batchRoot, 'prepared-manifest.json')
      prepared = preparedManifestSchema.parse(await readJson(preparedManifestPath))
      this.preparedManifestIdentity = await captureFileIdentity(preparedManifestPath)
      if (prepared.batchId !== inspected.manifest.batchId) {
        prepared = null
        preparedManifestState = 'invalid'
      }
      if (
        prepared &&
        new Set(prepared.items.map((item) => item.itemId)).size !== prepared.items.length
      ) {
        prepared = null
        preparedManifestState = 'invalid'
      }
    } catch (error) {
      prepared = null
      if (error instanceof AppError) {
        preparedManifestInvalidCode = error.code
        preparedManifestInvalidReason = error.message
      }
      preparedManifestState =
        !(error instanceof AppError) && (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'missing'
          : 'invalid'
    }

    const exclusions = [...inspected.exclusions]
    if (preparedManifestState === 'invalid') {
      exclusions.push(exclusion(preparedManifestInvalidCode, preparedManifestInvalidReason))
    }
    const publicItems: AuthorizedMediaCatalogItem[] = []
    for (const [videoId, source] of inspected.validSources) {
      const preparedItem = prepared?.items.find((item) => item.itemId === videoId)
      if (
        !preparedItem &&
        (preparedManifestState === 'missing' || preparedManifestState === 'ready')
      ) {
        exclusions.push(
          exclusion(
            'AUTHORIZED_MEDIA_DERIVATIVE_MISSING',
            'Browser-compatible derivative is missing',
            videoId
          )
        )
        continue
      }
      if (!preparedItem) continue
      if (preparedItem.sourceSha256 !== source.item.sha256) {
        exclusions.push(
          exclusion(
            'AUTHORIZED_MEDIA_DERIVATIVE_STALE',
            'Browser-compatible derivative does not match the authorized source',
            videoId
          )
        )
        continue
      }
      const video = await verifyPreparedAsset(batchRoot, preparedItem.video)
      const poster = await verifyPreparedAsset(batchRoot, preparedItem.poster)
      if (!video || !poster) {
        exclusions.push(
          exclusion(
            'AUTHORIZED_MEDIA_DERIVATIVE_INVALID',
            'Browser-compatible derivative or poster failed integrity checks',
            videoId
          )
        )
        continue
      }
      let videoProbe: ProbedMedia
      try {
        videoProbe = await this.probe.probe(video.filePath)
      } catch {
        exclusions.push(
          exclusion(
            'AUTHORIZED_MEDIA_DERIVATIVE_PROBE_FAILED',
            'Browser-compatible derivative probe failed',
            videoId
          )
        )
        continue
      }
      if (
        !metadataMatches(videoProbe, preparedItem.video) ||
        Math.abs(videoProbe.durationSeconds - source.item.durationSeconds) > 0.25
      ) {
        exclusions.push(
          exclusion(
            'AUTHORIZED_MEDIA_DERIVATIVE_METADATA_MISMATCH',
            'Browser-compatible derivative metadata failed validation',
            videoId
          )
        )
        continue
      }

      const publicItem: AuthorizedMediaCatalogItem = {
        videoId,
        title: source.item.title,
        author: source.item.author,
        publishedAtObserved: source.item.publishedAtObserved,
        aiGeneratedDisclosureObserved: source.item.aiGeneratedDisclosureObserved,
        durationMs: Math.round(videoProbe.durationSeconds * 1000),
        width: videoProbe.width,
        height: videoProbe.height,
        sourceSha256: source.item.sha256,
        derivativeSha256: preparedItem.video.sha256,
        mediaUrl: `/api/finance/v1/media/${videoId}/video`,
        posterUrl: `/api/finance/v1/media/${videoId}/poster`,
        financeExperienceId: AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID[videoId]
      }
      publicItems.push(publicItem)
      this.assets.set(videoId, { publicItem, source, video, poster })
    }

    const mappedAvailabilityExclusions = exclusions.filter(
      (item) => item.code !== 'AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED'
    )
    const onlyMissingDerivatives =
      mappedAvailabilityExclusions.length > 0 &&
      mappedAvailabilityExclusions.every(
        (item) => item.code === 'AUTHORIZED_MEDIA_DERIVATIVE_MISSING'
      )
    this.catalog = {
      batchId: inspected.manifest.batchId,
      status:
        publicItems.length > 0
          ? 'ready'
          : onlyMissingDerivatives
            ? 'derivative_missing'
            : 'invalid',
      expiresAt: inspected.expiresAt,
      total: publicItems.length,
      items: publicItems,
      exclusions
    }
    return this.catalog
  }

  async getCatalog(): Promise<AuthorizedMediaCatalog> {
    if (!this.catalog) return this.refresh()
    if (this.rightsExpiresAt && this.now().getTime() > Date.parse(this.rightsExpiresAt)) {
      return this.refresh()
    }
    if (this.catalog.status !== 'ready') return this.refresh()
    if (!(await this.cachedInputsAreCurrent())) return this.refresh()
    return this.catalog
  }

  private async cachedInputsAreCurrent(): Promise<boolean> {
    if (!(await fileIdentityMatches(this.manifestIdentity))) return false
    if (!(await fileIdentityMatches(this.preparedManifestIdentity))) return false
    for (const item of this.assets.values()) {
      if (!(await fileIdentityMatches(item.source))) return false
      if (!(await fileIdentityMatches(item.video))) return false
      if (!(await fileIdentityMatches(item.poster))) return false
    }
    return true
  }

  async resolveAsset(videoId: string, kind: 'video' | 'poster'): Promise<ResolvedAuthorizedAsset> {
    await this.getCatalog()
    if (!this.knownIds.has(videoId)) {
      throw new AppError('AUTHORIZED_MEDIA_NOT_FOUND', 'Authorized media was not found', {
        status: 404
      })
    }
    if (this.rightsExpiresAt && this.now().getTime() > Date.parse(this.rightsExpiresAt)) {
      throw new AppError(
        'AUTHORIZED_MEDIA_RIGHTS_EXPIRED',
        'Authorized media rights have expired',
        {
          status: 410
        }
      )
    }
    const item = this.assets.get(videoId)
    if (!item) {
      throw new AppError('AUTHORIZED_MEDIA_NOT_AVAILABLE', 'Authorized media is not available', {
        status: 404
      })
    }
    const asset = item[kind]
    if (!(await fileIdentityMatches(item.source)) || !(await fileIdentityMatches(asset))) {
      throw new AppError('AUTHORIZED_MEDIA_NOT_AVAILABLE', 'Authorized media is not available', {
        status: 404
      })
    }
    return asset
  }
}

export interface PreparedAuthorizedMediaResult {
  batchId: string
  outputDirectory: string
  itemCount: number
}

export class AuthorizedMediaPreparer {
  private readonly runner: CommandRunner
  private readonly probe: MediaProbe
  private readonly now: () => Date
  private readonly ffmpegPath: string

  constructor(
    private readonly options: {
      manifestPath: string
      preparedRoot: string
      ffmpegPath?: string
      ffprobePath?: string
      runner?: CommandRunner
      probe?: MediaProbe
      now?: () => Date
      maxLongEdge?: number
      videoPreset?: string
      videoCrf?: number
      maxVideoBitrateKbps?: number
      audioBitrate?: string
      posterLongEdge?: number
    }
  ) {
    this.runner = options.runner ?? new NodeCommandRunner()
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
    this.probe =
      options.probe ?? new FfprobeMediaProbe(options.ffprobePath ?? 'ffprobe', this.runner)
    this.now = options.now ?? (() => new Date())
  }

  async prepare(): Promise<PreparedAuthorizedMediaResult> {
    const inspected = await inspectManifest({
      manifestPath: this.options.manifestPath,
      probe: this.probe,
      now: this.now
    })
    const fatalExclusions = inspected.exclusions.filter(
      (item) => item.code !== 'AUTHORIZED_MEDIA_EXPERIENCE_UNMAPPED'
    )
    if (!inspected.manifest || inspected.expired || fatalExclusions.length > 0) {
      throw new AppError(
        'AUTHORIZED_MEDIA_MANIFEST_REJECTED',
        'Authorized media manifest failed validation',
        {
          status: inspected.expired ? 410 : 422,
          details: { exclusions: fatalExclusions }
        }
      )
    }
    const mappedItems = inspected.manifest.items.filter((item) =>
      Boolean(AUTHORIZED_FINANCE_EXPERIENCE_BY_VIDEO_ID[item.itemId])
    )
    if (inspected.validSources.size !== mappedItems.length) {
      throw new AppError(
        'AUTHORIZED_MEDIA_MANIFEST_REJECTED',
        'Not every authorized source is valid',
        {
          status: 422
        }
      )
    }

    const preparedRoot = path.resolve(this.options.preparedRoot)
    const outputDirectory = path.join(preparedRoot, inspected.manifest.batchId)
    try {
      await stat(outputDirectory)
      throw new AppError(
        'AUTHORIZED_MEDIA_BATCH_EXISTS',
        'Prepared media batch already exists; refusing to overwrite it',
        { status: 409 }
      )
    } catch (error) {
      if (error instanceof AppError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await mkdir(preparedRoot, { recursive: true })
    const temporaryDirectory = path.join(
      preparedRoot,
      `.${inspected.manifest.batchId}.tmp-${randomUUID()}`
    )
    const videoDirectory = path.join(temporaryDirectory, 'video')
    const posterDirectory = path.join(temporaryDirectory, 'poster')
    await mkdir(videoDirectory, { recursive: true })
    await mkdir(posterDirectory, { recursive: true })

    const preparedItems: PreparedManifest['items'] = []
    try {
      for (const item of mappedItems) {
        const source = inspected.validSources.get(item.itemId)
        if (!source) throw new Error('Validated source unexpectedly missing')
        const videoRelativePath = `video/${item.itemId}.mp4`
        const posterRelativePath = `poster/${item.itemId}.jpg`
        const videoPath = path.join(temporaryDirectory, videoRelativePath)
        const posterPath = path.join(temporaryDirectory, posterRelativePath)

        const maxLongEdge = this.options.maxLongEdge
        const videoFilter = maxLongEdge
          ? item.width >= item.height
            ? `scale=${Math.min(item.width, maxLongEdge)}:-2`
            : `scale=-2:${Math.min(item.height, maxLongEdge)}`
          : undefined
        const bitrateArgs = this.options.maxVideoBitrateKbps
          ? [
              '-maxrate',
              `${this.options.maxVideoBitrateKbps}k`,
              '-bufsize',
              `${this.options.maxVideoBitrateKbps * 2}k`
            ]
          : []
        await this.runner.run(this.ffmpegPath, [
          '-nostdin',
          '-y',
          '-i',
          source.filePath,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          'libx264',
          ...(videoFilter ? ['-vf', videoFilter] : []),
          '-pix_fmt',
          'yuv420p',
          '-preset',
          this.options.videoPreset ?? 'medium',
          '-crf',
          String(this.options.videoCrf ?? 23),
          ...bitrateArgs,
          '-c:a',
          'aac',
          '-b:a',
          this.options.audioBitrate ?? '128k',
          '-movflags',
          '+faststart',
          videoPath
        ])
        const posterSecond = Math.min(1, Math.max(0, item.durationSeconds / 2))
        const posterLongEdge = this.options.posterLongEdge ?? 720
        const posterFilter =
          item.width >= item.height
            ? `scale=${Math.min(item.width, posterLongEdge)}:-2`
            : `scale=-2:${Math.min(item.height, posterLongEdge)}`
        await this.runner.run(this.ffmpegPath, [
          '-nostdin',
          '-y',
          '-ss',
          posterSecond.toFixed(3),
          '-i',
          source.filePath,
          '-frames:v',
          '1',
          '-vf',
          posterFilter,
          '-q:v',
          '2',
          posterPath
        ])

        const videoStat = await stat(videoPath)
        const posterStat = await stat(posterPath)
        const probed = await this.probe.probe(videoPath)
        const codecAndDurationMatch =
          Math.abs(probed.durationSeconds - item.durationSeconds) <= 0.25 &&
          probed.videoCodec.toLowerCase() === 'h264' &&
          probed.audioCodec?.toLowerCase() === 'aac' &&
          probed.pixelFormat === 'yuv420p'
        const dimensionsMatch = maxLongEdge
          ? Math.max(probed.width, probed.height) <= maxLongEdge &&
            Math.abs(probed.width / probed.height - item.width / item.height) <= 0.02
          : probed.width === item.width && probed.height === item.height
        if (!codecAndDurationMatch || !dimensionsMatch) {
          throw new AppError(
            'AUTHORIZED_MEDIA_DERIVATIVE_METADATA_MISMATCH',
            'Generated browser derivative failed validation',
            { status: 422, details: { videoId: item.itemId } }
          )
        }
        preparedItems.push({
          itemId: item.itemId,
          sourceSha256: item.sha256,
          video: {
            relativePath: videoRelativePath,
            mimeType: 'video/mp4',
            videoCodec: 'h264',
            audioCodec: 'aac',
            pixelFormat: 'yuv420p',
            width: probed.width,
            height: probed.height,
            durationSeconds: probed.durationSeconds,
            bytes: videoStat.size,
            sha256: await digestFile(videoPath)
          },
          poster: {
            relativePath: posterRelativePath,
            mimeType: 'image/jpeg',
            bytes: posterStat.size,
            sha256: await digestFile(posterPath)
          }
        })
      }

      const preparedManifest: PreparedManifest = {
        schemaVersion: 1,
        batchId: inspected.manifest.batchId,
        preparedAt: this.now().toISOString(),
        items: preparedItems
      }
      await writeFile(
        path.join(temporaryDirectory, 'prepared-manifest.json'),
        `${JSON.stringify(preparedManifest, null, 2)}\n`,
        { flag: 'wx' }
      )
      await rename(temporaryDirectory, outputDirectory)
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true })
      throw error
    }

    return {
      batchId: inspected.manifest.batchId,
      outputDirectory,
      itemCount: preparedItems.length
    }
  }
}
