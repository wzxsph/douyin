import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const e2eMediaDirectory = path.resolve('.analysis-work/e2e-media')
const e2eVideoPath = path.join(e2eMediaDirectory, 'authorized-finance-fixture.mp4')

test.beforeAll(() => {
  mkdirSync(e2eMediaDirectory, { recursive: true })
  execFileSync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=180x320:r=5',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      '173.710',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '40',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-shortest',
      e2eVideoPath
    ],
    { stdio: 'ignore' }
  )
})

const viewports = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 }
]

const authorizedVideo = {
  videoId: '7664748624454192393',
  financeExperienceId: 'finance-xiaolin-fifa',
  title: '大家看的是比赛，FIFA看的是生意',
  author: '小Lin说',
  publishedAtObserved: '2026-07-21 06:59',
  aiGeneratedDisclosureObserved: false,
  durationMs: 173_710,
  width: 1080,
  height: 1920,
  sourceSha256: 'a75cb3f796e0f96d3574d3d0b210cf3276de3fe8cf8382def76b1a0edc0cb464',
  derivativeSha256: 'b'.repeat(64),
  mediaUrl: '/api/finance/v1/media/7664748624454192393/video',
  posterUrl: '/api/finance/v1/media/7664748624454192393/poster'
}

async function installAuthorizedCatalog(page: Page) {
  await page.route('**/api/finance/v1/media/7664748624454192393/video', async (route) => {
    const media = readFileSync(e2eVideoPath)
    const range = route.request().headers().range
    const commonHeaders = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4'
    }
    if (!range) {
      await route.fulfill({
        status: 200,
        headers: { ...commonHeaders, 'Content-Length': String(media.byteLength) },
        body: route.request().method() === 'HEAD' ? undefined : media
      })
      return
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) {
      await route.fulfill({
        status: 416,
        headers: { ...commonHeaders, 'Content-Range': `bytes */${media.byteLength}` }
      })
      return
    }
    const requestedStart = match[1]
      ? Number(match[1])
      : Math.max(0, media.byteLength - Number(match[2]))
    const requestedEnd = match[1]
      ? match[2]
        ? Number(match[2])
        : media.byteLength - 1
      : media.byteLength - 1
    if (
      !Number.isSafeInteger(requestedStart) ||
      !Number.isSafeInteger(requestedEnd) ||
      requestedStart < 0 ||
      requestedStart >= media.byteLength ||
      requestedEnd < requestedStart
    ) {
      await route.fulfill({
        status: 416,
        headers: { ...commonHeaders, 'Content-Range': `bytes */${media.byteLength}` }
      })
      return
    }
    const end = Math.min(requestedEnd, media.byteLength - 1)
    const body = media.subarray(requestedStart, end + 1)
    await route.fulfill({
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${requestedStart}-${end}/${media.byteLength}`
      },
      body: route.request().method() === 'HEAD' ? undefined : body
    })
  })
  await page.route('**/api/finance/v1/media/7664748624454192393/poster', async (route) => {
    await route.fulfill({ status: 404, body: '' })
  })
  await page.route('**/api/finance/v1/media/catalog', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        batchId: 'e2e-authorized-media',
        status: 'ready',
        expiresAt: '2026-08-22',
        total: 1,
        items: [authorizedVideo],
        exclusions: []
      })
    })
  })
}

async function installExpiredCatalog(page: Page) {
  await page.route('**/api/finance/v1/media/catalog', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        batchId: 'e2e-authorized-media',
        status: 'expired',
        expiresAt: '2026-08-22T23:59:59.999+08:00',
        total: 0,
        items: [],
        exclusions: [{ code: 'AUTHORIZED_MEDIA_RIGHTS_EXPIRED', reason: 'expired' }]
      })
    })
  })
}

async function openCleanDemo(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => localStorage.clear())
  await installAuthorizedCatalog(page)
  await page.goto('/?demo=finance-fed', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/home\?demo=finance-fed/)
  await expect(page.getByTestId('finance-cue-extension')).toBeVisible()
  const video = page.locator('.video-wrapper:has([data-testid="finance-cue-extension"]) video')
  await expect
    .poll(async () => video.evaluate((element: HTMLVideoElement) => element.duration), {
      timeout: 15_000
    })
    .toBeCloseTo(authorizedVideo.durationMs / 1000, 0)
  await video.evaluate(async (element: HTMLVideoElement) => {
    element.muted = true
    await element.play()
  })
  return video
}

async function seekForCue(page: Page, seconds: number) {
  const video = page.locator('.video-wrapper:has([data-testid="finance-cue-extension"]) video')
  await video.evaluate(
    (element: HTMLVideoElement, target) => {
      element.currentTime = target
      element.dispatchEvent(new Event('timeupdate'))
    },
    Math.max(0, seconds - 0.2)
  )
  await page.waitForTimeout(60)
  await video.evaluate((element: HTMLVideoElement, target) => {
    element.currentTime = target
    element.dispatchEvent(new Event('timeupdate'))
  }, seconds)
}

async function openVisibleCue(page: Page, verifyHitTarget = true) {
  const cue = page.getByTestId('finance-cue-pill')
  await expect(cue).toHaveCount(1, { timeout: 2_000 })
  await expect(cue).toBeVisible({ timeout: 2_000 })
  const main = cue.locator('.cue-main')
  if (verifyHitTarget) {
    const hitTarget = await main.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return Boolean(hit && element.contains(hit))
    })
    expect(hitTarget).toBe(true)
  }
  // The base feed uses overflow-hidden virtual cards. dispatchEvent avoids
  // Playwright's scroll-into-view changing the container scrollTop after the
  // hit target has already been proven visible and unobstructed.
  await main.dispatchEvent('click')
  return cue
}

for (const viewport of viewports) {
  test(`${viewport.width}×${viewport.height} 邀请不停播、进入暂停且半屏不越界`, async ({
    page
  }) => {
    const video = await openCleanDemo(page, viewport)
    await seekForCue(page, 20.1)

    const invitation = page.getByTestId('finance-cue-pill')
    await expect(invitation).toBeVisible()
    const poiGeometry = await invitation.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const image = element.querySelector('img')!.getBoundingClientRect()
      const main = element.querySelector('.cue-main')!.getBoundingClientRect()
      const later = element.querySelector('.later')!.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        imageWidth: image.width,
        imageHeight: image.height,
        mainHeight: main.height,
        laterWidth: later.width,
        laterHeight: later.height
      }
    })
    expect(poiGeometry.width).toBeLessThanOrEqual(216.5)
    expect(poiGeometry.height).toBeGreaterThanOrEqual(44)
    expect(poiGeometry.height).toBeLessThanOrEqual(45)
    expect(poiGeometry.imageWidth).toBeCloseTo(24, 0)
    expect(poiGeometry.imageHeight).toBeCloseTo(24, 0)
    expect(poiGeometry.mainHeight).toBeGreaterThanOrEqual(44)
    expect(poiGeometry.laterWidth).toBeGreaterThanOrEqual(44)
    expect(poiGeometry.laterHeight).toBeGreaterThanOrEqual(44)

    const invitationTime = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    await page.waitForTimeout(300)
    const invitationTimeAfter = await video.evaluate(
      (element: HTMLVideoElement) => element.currentTime
    )
    expect(invitationTimeAfter).toBeGreaterThan(invitationTime + 0.15)

    await video.evaluate((element: HTMLVideoElement) => {
      element.muted = true
      element.volume = 0.37
      element.playbackRate = 1.25
    })
    await openVisibleCue(page)

    const timeBefore = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    const sheet = page.getByTestId('caibao-half-sheet')
    await expect(sheet).toBeVisible()

    const geometry = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        height: rect.height,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      }
    })
    expect(geometry.height / geometry.viewportHeight).toBeLessThanOrEqual(0.4801)
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5)
    expect(page.locator('.finance-extension .mask')).toHaveCount(0)
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)

    await page.waitForTimeout(450)
    const timeAfter = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    expect(Math.abs(timeAfter - timeBefore)).toBeLessThanOrEqual(0.25)

    const authorSrc = await page
      .locator('.video-wrapper:has([data-testid="finance-cue-extension"]) .toolbar .avatar')
      .getAttribute('src')
    const caibaoSrc = await sheet.locator('header img').getAttribute('src')
    expect(authorSrc).not.toContain('caibao')
    expect(caibaoSrc).toContain('caibao')

    const controls = sheet.locator('button')
    const controlCount = await controls.count()
    for (let index = 0; index < controlCount; index += 1) {
      const box = await controls.nth(index).boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
      expect(box?.width).toBeGreaterThanOrEqual(44)
    }

    await sheet.getByRole('button', { name: '关闭' }).click()
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
      .toBe(false)
    const settings = await video.evaluate((element: HTMLVideoElement) => ({
      muted: element.muted,
      volume: element.volume,
      playbackRate: element.playbackRate
    }))
    expect(settings).toEqual({ muted: true, volume: 0.37, playbackRate: 1.25 })
    const resumedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    expect(Math.abs(resumedAt - timeAfter)).toBeLessThanOrEqual(0.25)
    await page.waitForTimeout(300)
    const resumedAfter = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    expect(resumedAfter).toBeGreaterThan(resumedAt + 0.15)
  })
}

test('进入前已暂停时，关闭财包后仍保持暂停且不 seek', async ({ page }) => {
  const video = await openCleanDemo(page, viewports[0])
  await seekForCue(page, 20.1)
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  const before = await video.evaluate((element: HTMLVideoElement) => element.currentTime)

  await openVisibleCue(page)
  await expect(page.getByTestId('caibao-half-sheet')).toBeVisible()
  await page.getByTestId('caibao-half-sheet').getByRole('button', { name: '关闭' }).click()
  await page.waitForTimeout(300)

  const result = await video.evaluate((element: HTMLVideoElement) => ({
    paused: element.paused,
    currentTime: element.currentTime
  }))
  expect(result.paused).toBe(true)
  expect(Math.abs(result.currentTime - before)).toBeLessThanOrEqual(0.25)
})

test('只有用户点击时间轴节点时才显式 seek，并在打开互动后保持暂停', async ({ page }) => {
  const video = await openCleanDemo(page, viewports[0])
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 42
  })

  await page.getByRole('button', { name: /回看：体育赛事怎么变成一门大生意/ }).click()
  await expect(page.getByTestId('caibao-half-sheet')).toBeVisible()

  const result = await video.evaluate((element: HTMLVideoElement) => ({
    paused: element.paused,
    currentTime: element.currentTime
  }))
  expect(result.paused).toBe(true)
  expect(Math.abs(result.currentTime - 20)).toBeLessThanOrEqual(0.25)
})

test('三类触点形成无分数的过程式学习总结', async ({ page }) => {
  await openCleanDemo(page, viewports[0])

  await seekForCue(page, 20.1)
  await openVisibleCue(page, false)
  await page.getByRole('button', { name: '我知道了' }).click()
  await expect(page.getByTestId('finance-feedback')).toContainText('商业三层结构')
  await page.getByRole('button', { name: '收好，继续看' }).click()

  await seekForCue(page, 65.1)
  await openVisibleCue(page, false)
  await page
    .getByTestId('finance-interaction')
    .getByRole('button', { name: '转播权收入为主' })
    .click()
  await expect(page.getByTestId('finance-feedback')).toContainText('媒体合同')
  await page.getByRole('button', { name: '收好，继续看' }).click()

  await seekForCue(page, 120.1)
  await openVisibleCue(page, false)
  await page
    .getByTestId('finance-interaction')
    .getByRole('button', { name: '主办国承担场馆和基建成本，回报不确定' })
    .click()
  await expect(page.getByTestId('finance-feedback')).toContainText('前期投入')
  await page.getByRole('button', { name: '收好，继续看' }).click()

  await page.getByRole('button', { name: '学习足迹' }).click()
  const summary = page.getByTestId('finance-learning-summary')
  await expect(summary).toBeVisible()
  await expect(summary.locator('li')).toHaveCount(3)
  await expect(summary).not.toContainText('68%')
  await expect(summary).not.toContainText('总分')
  await expect(summary).not.toContainText('买入')
  await expect(summary).not.toContainText('必涨')
})

test('普通推荐流同样只加载授权目录视频及其财经扩展', async ({ page }) => {
  await page.setViewportSize(viewports[0])
  await installAuthorizedCatalog(page)
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  const videoWrapper = page.locator('.video-wrapper:has([data-testid="finance-cue-extension"])')
  await expect(videoWrapper).toBeVisible()
  await expect(videoWrapper.locator('video source')).toHaveAttribute(
    'src',
    authorizedVideo.mediaUrl
  )
})

test('授权目录过期时普通推荐和长视频推荐都显示明确空态', async ({ page }) => {
  await page.setViewportSize(viewports[0])
  await installExpiredCatalog(page)
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('authorized-feed-empty')).toContainText('授权已到期')

  await page.getByText('长视频', { exact: true }).dispatchEvent('click')
  await expect(page.getByTestId('authorized-long-feed-empty')).toContainText('授权已到期')
})
