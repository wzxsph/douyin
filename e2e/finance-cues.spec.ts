import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const e2eMediaDirectory = path.resolve('.analysis-work/e2e-media')
const e2eVideoPath = path.join(e2eMediaDirectory, 'showcase-fixture.mp4')
const bundle = JSON.parse(
  readFileSync(path.resolve('src/showcase/generated/showcase-bundle.json'), 'utf8')
) as {
  catalog: Array<{ videoId: string; author: string; title: string; sourceUrl: string }>
  experiences: Array<{
    videoId: string
    triggers: Array<{ startMs: number; prompt: string }>
  }>
}
const firstItem = bundle.catalog[0]
const firstExperience = bundle.experiences.find((item) => item.videoId === firstItem.videoId)!
const firstCue = firstExperience.triggers[0]

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
      'color=c=0x161616:s=180x320:r=5',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      '40',
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

async function installMedia(page: Page) {
  const media = readFileSync(e2eVideoPath)
  await page.route('**/api/finance/v1/media/*/video', async (route) => {
    const range = route.request().headers().range
    const headers = { 'Accept-Ranges': 'bytes', 'Content-Type': 'video/mp4' }
    if (!range) {
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'Content-Length': String(media.byteLength) },
        body: route.request().method() === 'HEAD' ? undefined : media
      })
      return
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match || (!match[1] && !match[2])) {
      await route.fulfill({
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${media.byteLength}` }
      })
      return
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, media.byteLength - Number(match[2]))
    const requestedEnd = match[1]
      ? match[2]
        ? Number(match[2])
        : media.byteLength - 1
      : media.byteLength - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      requestedEnd < start ||
      start >= media.byteLength
    ) {
      await route.fulfill({
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${media.byteLength}` }
      })
      return
    }
    const end = Math.min(requestedEnd, media.byteLength - 1)
    const body = media.subarray(start, end + 1)
    await route.fulfill({
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${start}-${end}/${media.byteLength}`
      },
      body: route.request().method() === 'HEAD' ? undefined : body
    })
  })
  await page.route('**/api/finance/v1/media/*/poster', (route) =>
    route.fulfill({ status: 404, body: '' })
  )
}

async function openShowcase(page: Page, viewport = viewports[0]) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => localStorage.clear())
  await installMedia(page)
  await page.goto('/#/home', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/home/)
  const player = page.locator(`.showcase-player[data-video-id="${firstItem.videoId}"]`)
  await expect(player).toBeVisible()
  const video = player.locator('video')
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.readyState))
    .toBeGreaterThanOrEqual(1)
  await video.evaluate(async (node: HTMLVideoElement) => {
    node.muted = true
    await node.play()
  })
  return { player, video }
}

async function surfaceFirstCue(page: Page) {
  const video = page.locator(`.showcase-player[data-video-id="${firstItem.videoId}"] video`)
  const targetSeconds = firstCue.startMs / 1000
  await video.evaluate((node: HTMLVideoElement, target) => {
    node.currentTime = Math.max(0, target - 0.25)
    node.dispatchEvent(new Event('timeupdate'))
  }, targetSeconds)
  await page.waitForTimeout(80)
  await video.evaluate((node: HTMLVideoElement, target) => {
    node.currentTime = target
    node.dispatchEvent(new Event('timeupdate'))
  }, targetSeconds)
  await expect(page.getByTestId('finance-cue-pill')).toBeVisible({ timeout: 2_000 })
}

for (const viewport of viewports) {
  test(`${viewport.width}×${viewport.height} POI 不停播，进入暂停且半屏不越界`, async ({
    page
  }) => {
    const { player, video } = await openShowcase(page, viewport)
    await surfaceFirstCue(page)

    const invitation = page.getByTestId('finance-cue-pill')
    const geometry = await invitation.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const main = element.querySelector('.cue-main')!.getBoundingClientRect()
      const later = element.querySelector('.later')!.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        mainHeight: main.height,
        laterWidth: later.width,
        laterHeight: later.height
      }
    })
    expect(geometry.width).toBeLessThanOrEqual(216.5)
    expect(geometry.height).toBeGreaterThanOrEqual(44)
    expect(geometry.mainHeight).toBeGreaterThanOrEqual(44)
    expect(geometry.laterWidth).toBeGreaterThanOrEqual(44)
    expect(geometry.laterHeight).toBeGreaterThanOrEqual(44)

    const beforeInvitation = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
    await page.waitForTimeout(300)
    const afterInvitation = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
    expect(afterInvitation).toBeGreaterThan(beforeInvitation + 0.15)

    await video.evaluate((node: HTMLVideoElement) => {
      node.volume = 0.37
      node.playbackRate = 1.25
    })
    await invitation.locator('.cue-main').dispatchEvent('click')
    const sheet = page.getByTestId('caibao-half-sheet')
    await expect(sheet).toBeVisible()
    const sheetGeometry = await sheet.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        height: rect.height,
        viewportHeight: innerHeight,
        left: rect.left,
        right: rect.right,
        viewportWidth: innerWidth
      }
    })
    expect(sheetGeometry.height / sheetGeometry.viewportHeight).toBeLessThanOrEqual(0.4801)
    expect(sheetGeometry.left).toBeGreaterThanOrEqual(0)
    expect(sheetGeometry.right).toBeLessThanOrEqual(sheetGeometry.viewportWidth + 0.5)
    expect(page.locator('.finance-extension .mask')).toHaveCount(0)
    expect(await video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(true)

    const pausedAt = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
    await page.waitForTimeout(450)
    const pausedAfter = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
    expect(Math.abs(pausedAfter - pausedAt)).toBeLessThanOrEqual(0.25)

    const authorText = await player.locator('.author-avatar').textContent()
    const caibaoSrc = await sheet.locator('header img').getAttribute('src')
    expect(authorText?.trim()).toBe(firstItem.author.slice(0, 1))
    expect(caibaoSrc).toContain('caibao')

    await sheet.getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false)
    expect(
      await video.evaluate((node: HTMLVideoElement) => ({
        muted: node.muted,
        volume: node.volume,
        playbackRate: node.playbackRate
      }))
    ).toEqual({ muted: true, volume: 0.37, playbackRate: 1.25 })
  })
}

test('首次进入提供显式有声播放入口并记住用户选择', async ({ page }) => {
  const { player, video } = await openShowcase(page)
  const soundPrompt = player.getByTestId('showcase-sound-prompt')

  await expect(soundPrompt).toBeVisible()
  expect(await video.evaluate((node: HTMLVideoElement) => node.muted)).toBe(true)

  await soundPrompt.click()
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.muted)).toBe(false)
  await expect.poll(() => video.evaluate((node: HTMLVideoElement) => node.paused)).toBe(false)
  await expect(soundPrompt).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('caibao-showcase-sound-enabled'))).toBe(
    'true'
  )
})

test('进入前已暂停，关闭后保持暂停且不改变位置', async ({ page }) => {
  const { video } = await openShowcase(page)
  await surfaceFirstCue(page)
  await video.evaluate((node: HTMLVideoElement) => node.pause())
  const before = await video.evaluate((node: HTMLVideoElement) => node.currentTime)
  await page.getByTestId('finance-cue-pill').locator('.cue-main').dispatchEvent('click')
  await page.getByTestId('caibao-half-sheet').getByRole('button', { name: '关闭' }).click()
  await page.waitForTimeout(250)
  const result = await video.evaluate((node: HTMLVideoElement) => ({
    paused: node.paused,
    time: node.currentTime
  }))
  expect(result.paused).toBe(true)
  expect(Math.abs(result.time - before)).toBeLessThanOrEqual(0.25)
})

test('推荐页保留 Mock、非官方、非投资建议和原作品归属', async ({ page }) => {
  const { player } = await openShowcase(page)
  await expect(player.locator('.mock-chip')).toHaveText('LLM Mock')
  await expect(player.locator('.content-notice')).toContainText('未经财经审核')
  const source = player.getByRole('link', { name: /查看抖音原作品/ })
  await expect(source).toHaveAttribute('href', firstItem.sourceUrl)
  await page.locator('.project-disclosure summary').click()
  await expect(page.locator('.project-disclosure')).toContainText('不存在官方隶属关系')
  await expect(page.locator('.project-disclosure')).toContainText('不构成投资建议')
})

test('作者页只展示该作者的清单作品并可返回推荐流', async ({ page }) => {
  const { player } = await openShowcase(page)
  await player.locator('.author-avatar').click()
  await expect(page).toHaveURL(/#\/author\/xiaolin/)
  await expect(page.getByRole('heading', { name: '小Lin说' })).toBeVisible()
  await expect(page.locator('.work-card')).toHaveCount(5)
  await expect(
    page.locator('.work-card').first().getByRole('link', { name: '原视频 ↗' })
  ).toHaveAttribute('href', firstItem.sourceUrl)
  await page.getByRole('link', { name: '返回推荐' }).click()
  await expect(page).toHaveURL(/#\/home/)
})

test('旧商城与个人中心路由不再暴露，统一回推荐页', async ({ page }) => {
  await installMedia(page)
  await page.goto('/#/shop', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/#\/home/)
  await expect(page.locator('.feed')).toBeVisible()
  await expect(page.locator('.tabbar, .shop, .message')).toHaveCount(0)
})
