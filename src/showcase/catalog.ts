import { z } from 'zod'
import {
  approvedExperienceSchema,
  type ApprovedExperience
} from '@/features/finance-cues/contracts'
import rawBundle from './generated/showcase-bundle.json'

const catalogItemSchema = z.object({
  videoId: z.string().min(1),
  financeExperienceId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  authorSlug: z.string().min(1),
  sourceUrl: z.string().url(),
  publishedAtObserved: z.string().min(1),
  aiGeneratedDisclosureObserved: z.boolean(),
  durationMs: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  derivativeSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  derivativeBytes: z.number().int().positive().nullable(),
  mediaFile: z.string().regex(/^[A-Za-z0-9_-]+\.mp4$/),
  posterFile: z.string().regex(/^[A-Za-z0-9_-]+\.jpg$/)
})

const showcaseBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    batchId: z.string().min(1),
    generatedAt: z.string().datetime(),
    expiresAt: z.string().datetime({ offset: true }),
    rights: z.object({
      status: z.literal('user_attested_not_independently_verified'),
      subject: z.string().min(1),
      attestationId: z.string().min(1),
      sourcePurpose: z.string().min(1),
      deploymentInstruction: z.literal('user_requested_github_pages_showcase')
    }),
    disclosure: z.object({
      product: z.string().min(1),
      media: z.string().min(1),
      content: z.string().min(1),
      investment: z.string().min(1)
    }),
    authors: z.array(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1),
        itemCount: z.number().int().positive()
      })
    ),
    catalog: z.array(catalogItemSchema).min(1),
    experiences: z.array(approvedExperienceSchema).min(1)
  })
  .superRefine((bundle, context) => {
    const videoIds = new Set(bundle.catalog.map((item) => item.videoId))
    const experienceIds = new Set(bundle.experiences.map((item) => item.experienceId))
    if (videoIds.size !== bundle.catalog.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Showcase catalog video ids must be unique',
        path: ['catalog']
      })
    }
    if (
      bundle.catalog.some(
        (item) =>
          !experienceIds.has(item.financeExperienceId) ||
          bundle.experiences.find(
            (experience) => experience.experienceId === item.financeExperienceId
          )?.videoId !== item.videoId
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Every catalog item must map to its own experience',
        path: ['catalog']
      })
    }
  })

export const showcaseBundle = showcaseBundleSchema.parse(rawBundle)
export type ShowcaseCatalogItem = z.infer<typeof catalogItemSchema>

export const showcaseExperiences: Readonly<Record<string, ApprovedExperience>> = Object.freeze(
  Object.fromEntries(showcaseBundle.experiences.map((item) => [item.experienceId, item]))
)

export function isShowcaseExpired(now = Date.now()): boolean {
  return now > Date.parse(showcaseBundle.expiresAt)
}

function mediaBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_SHOWCASE_MEDIA_BASE_URL?.trim()
  return configured ? configured.replace(/\/?$/, '/') : undefined
}

function financeApiUrl(path: string): string {
  const configured = import.meta.env.VITE_FINANCE_API_BASE_URL?.trim()
  if (!configured) return path
  return new URL(path, configured.replace(/\/?$/, '/')).href
}

export function showcaseMediaUrl(item: ShowcaseCatalogItem): string {
  const base = mediaBaseUrl()
  return base
    ? new URL(item.mediaFile, base).href
    : financeApiUrl(`/api/finance/v1/media/${encodeURIComponent(item.videoId)}/video`)
}

export function showcasePosterUrl(item: ShowcaseCatalogItem): string {
  const base = mediaBaseUrl()
  return base
    ? new URL(item.posterFile, base).href
    : financeApiUrl(`/api/finance/v1/media/${encodeURIComponent(item.videoId)}/poster`)
}

export function itemsByAuthor(authorSlug: string): ShowcaseCatalogItem[] {
  return showcaseBundle.catalog.filter((item) => item.authorSlug === authorSlug)
}

export function authorBySlug(authorSlug: string) {
  return showcaseBundle.authors.find((author) => author.slug === authorSlug)
}
