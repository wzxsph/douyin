import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 }
]

async function openCleanDemo(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/?demo=finance-fed', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/home\?demo=finance-fed/)
  await expect(page.getByTestId('finance-cue-extension')).toBeVisible()
  const video = page.locator('.video-wrapper:has([data-testid="finance-cue-extension"]) video')
  await expect
    .poll(async () => video.evaluate((element: HTMLVideoElement) => element.duration), {
      timeout: 15_000
    })
    .toBe(150)
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

async function openVisibleCue(page: Page) {
  const cue = page.getByTestId('finance-cue-pill')
  await expect(cue).toHaveCount(1, { timeout: 2_000 })
  await expect(cue).toBeVisible({ timeout: 2_000 })
  const main = cue.locator('.cue-main')
  const hitTarget = await main.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return Boolean(hit && element.contains(hit))
  })
  expect(hitTarget).toBe(true)
  // The base feed uses overflow-hidden virtual cards. dispatchEvent avoids
  // Playwright's scroll-into-view changing the container scrollTop after the
  // hit target has already been proven visible and unobstructed.
  await main.dispatchEvent('click')
  return cue
}

for (const viewport of viewports) {
  test(`${viewport.width}×${viewport.height} 保持连续播放且半屏不越界`, async ({ page }) => {
    const video = await openCleanDemo(page, viewport)
    await seekForCue(page, 15.1)
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
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)

    await page.waitForTimeout(450)
    const timeAfter = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
    expect(timeAfter).toBeGreaterThan(timeBefore + 0.25)

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
  })
}

test('三类触点形成无分数的过程式学习总结', async ({ page }) => {
  await openCleanDemo(page, viewports[0])

  await seekForCue(page, 15.1)
  await openVisibleCue(page)
  await page.getByRole('button', { name: '我知道了' }).click()
  await expect(page.getByTestId('finance-feedback')).toContainText('传导起点')
  await page.getByRole('button', { name: '收好，继续看' }).click()

  await seekForCue(page, 75.1)
  await openVisibleCue(page)
  await page
    .getByTestId('finance-interaction')
    .getByRole('button', { name: '衰退信号增强' })
    .click()
  await expect(page.getByTestId('finance-feedback')).toContainText('盈利下修')
  await page.getByRole('button', { name: '收好，继续看' }).click()

  await seekForCue(page, 135.1)
  await openVisibleCue(page)
  await page
    .getByTestId('finance-interaction')
    .getByRole('button', { name: '企业融资成本可能下降' })
    .click()
  await expect(page.getByTestId('finance-feedback')).toContainText('中间边')
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

test('普通推荐流不加载财经扩展', async ({ page }) => {
  await page.setViewportSize(viewports[0])
  await page.goto('/home', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('video')).not.toHaveCount(0)
  await expect(page.getByTestId('finance-cue-extension')).toHaveCount(0)
})
