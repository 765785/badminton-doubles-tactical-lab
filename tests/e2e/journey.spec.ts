import { expect, test } from '@playwright/test'

test('四人、发接发、依据、分支播放和本地保存', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '五个双打基础问题' })).toBeVisible()
  await page.getByRole('button', { name: /低发球 → 接发 → 第三拍/ }).click()
  await expect(page).toHaveURL(/#\/board$/)

  for (const id of ['A', 'B', 'C', 'D'] as const) {
    await page.getByRole('button', { name: new RegExp(`球员 ${id}，点击编辑`) }).press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByLabel('姓名').fill(`测试球员 ${id}`)
    await page.getByRole('dialog').getByRole('button', { name: '完成' }).click()
  }

  const player = page.getByRole('button', { name: /球员 B，点击编辑/ })
  const box = await player.boundingBox()
  if (!box) throw new Error('球员 B 没有可拖动区域')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 22, box.y + box.height / 2 + 12, { steps: 5 })
  await page.mouse.up()

  await page.getByRole('button', { name: '分析这一拍' }).click()
  await expect(page.getByText('根据当前设定找到')).toBeVisible()
  await page.getByRole('button', { name: /低发球到中线/ }).click()
  await expect(page.getByText('Evidence ID')).toBeVisible()
  await page.getByRole('button', { name: /接发推后场 继续推演/ }).click()
  await expect(page.getByText('2 / 2')).toBeVisible()
  await expect(page.getByRole('heading', { name: '战术分析' })).toBeVisible()
  await page.locator('.recommendation-list button').first().click()
  await expect(page.locator('.timeline-steps span')).toHaveCount(3)
  await page.locator('.response-list button').first().click()
  await expect(page.locator('.timeline-steps span')).toHaveCount(4)
  await expect(page.getByText('教学链已达到四拍。')).toBeVisible()
  await page.getByRole('button', { name: '暂停' }).click()
  await page.getByRole('button', { name: '播放', exact: true }).click()
  await page.getByRole('button', { name: '重新播放' }).click()
  await page.getByRole('button', { name: '2×' }).click()

  await page.getByRole('button', { name: '保存局面' }).click()
  await page.getByRole('dialog', { name: '保存战术局面' }).getByLabel('局面名称').fill('接发分支验收')
  await page.getByRole('dialog', { name: '保存战术局面' }).getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.reload()
  await page.getByRole('link', { name: '我的局面' }).click()
  await expect(page.getByRole('heading', { name: '接发分支验收' })).toBeVisible()
  await page.getByRole('button', { name: '打开' }).click()
  await expect(page.getByRole('button', { name: /A 测试球员 A 我方/ })).toBeVisible()
  await expect(page.locator('.timeline-steps span')).toHaveCount(4)
  await page.getByRole('link', { name: '战术依据', exact: true }).click()
  await expect(page.getByRole('heading', { name: '当前竞赛规则依据版本' })).toBeVisible()
  await expect(page.getByText('BWF Laws of Badminton V5.0 (2)')).toBeVisible()
  expect(errors).toEqual([])
})

for (const [label, width, height] of [
  ['手机竖屏', 390, 844],
  ['手机横屏', 844, 390],
  ['笔记本', 1366, 768],
  ['大屏', 1920, 1080],
] as const) {
  test(`${label}球场与主要操作没有横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/board')
    await expect(page.getByRole('img', { name: /可拖动的斜视双打球场/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '分析这一拍' })).toBeVisible()
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    expect(size.scroll).toBeLessThanOrEqual(size.viewport + 1)
  })
}
