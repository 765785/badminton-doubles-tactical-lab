import { expect, test, type Page } from '@playwright/test'

const errorsFor = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  return errors
}

async function drawFromCurrentHitter(page: Page) {
  const court = page.getByRole('img', { name: /可拖动并手绘球路/ })
  await court.scrollIntoViewIfNeeded()
  const hitter = await court.getAttribute('data-hitter')
  if (!hitter) throw new Error('缺少当前击球者')
  const target = hitter === 'A' || hitter === 'B' ? 'C' : 'A'
  const originBox = await court.getByRole('button', { name: new RegExp('球员 ' + hitter + '，') }).boundingBox()
  const targetBox = await court.getByRole('button', { name: new RegExp('球员 ' + target + '，') }).boundingBox()
  if (!originBox || !targetBox) throw new Error('球员图标不可见')
  await page.mouse.move(originBox.x + originBox.width / 2, originBox.y + originBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 14 })
  await page.mouse.up()
  await expect(page.getByRole('region', { name: '确认球路' })).toBeVisible()
}

async function commitSandboxShot(page: Page) {
  await page.getByRole('button', { name: '确认球种并分析这一拍' }).click()
  const contactAssumption = page.getByRole('button', { name: '假设能够接到并重新分析' })
  if (await contactAssumption.isVisible()) await contactAssumption.click()
  const candidates = page.getByRole('button', { name: /可接 ·/ })
  if (await candidates.count() > 1) await candidates.first().click()
  const assumed = page.getByRole('button', { name: /假设 [A-D] 成功接到/ })
  if (await assumed.count()) await assumed.first().click()
  await page.getByRole('button', { name: /执行这一拍并继续|记录结束这一拍/ }).click()
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible()
}

test('连续自由推演：画线确认、四人跑位、五拍、撤销分支和重载', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors = errorsFor(page)
  await page.goto('./#/board')
  await expect(page.getByRole('heading', { name: '画出这一拍，看懂四人怎么移动' })).toBeVisible()
  await page.getByRole('button', { name: '设置与球员' }).click()
  for (const [index, id] of (['A', 'B', 'C', 'D'] as const).entries()) {
    await page.locator('.sandbox-page .player-list-item').nth(index).click()
    await page.getByRole('dialog', { name: '编辑球员 ' + id }).getByLabel('姓名').fill('验收球员 ' + id)
    await page.getByRole('dialog', { name: '编辑球员 ' + id }).getByRole('button', { name: '保存到球员库' }).click()
    await page.getByRole('dialog', { name: '编辑球员 ' + id }).getByRole('button', { name: '完成' }).click()
  }
  await page.getByRole('button', { name: '画球路' }).first().click()
  await drawFromCurrentHitter(page)
  await expect(page.getByText(/仅凭画线无法确定|系统推测/)).toBeVisible()
  await expect(page.getByRole('heading', { name: '① 规则与物理成立性' })).toHaveCount(0)
  await commitSandboxShot(page)
  await expect(page.getByRole('heading', { name: '④ 四人移动与职责' })).toBeVisible()
  await expect(page.getByText('1 拍 · 可分支')).toBeVisible()
  for (let index = 2; index <= 5; index++) {
    await drawFromCurrentHitter(page)
    await commitSandboxShot(page)
    await expect(page.getByText(index + ' 拍 · 可分支')).toBeVisible()
  }
  await page.getByRole('button', { name: '播放' }).click()
  await page.getByRole('button', { name: '暂停' }).click()
  await page.getByRole('checkbox', { name: '逐阶段讲解' }).check()
  await page.getByRole('button', { name: '形成阵型' }).click()
  await page.getByRole('button', { name: '撤销上一拍' }).click()
  await expect(page.getByText('4 拍 · 可分支')).toBeVisible()
  await page.getByRole('button', { name: '重做下一拍' }).click()
  await expect(page.getByText('5 拍 · 可分支')).toBeVisible()
  await page.getByRole('button', { name: '从这一拍之前尝试另一种打法' }).click()
  await drawFromCurrentHitter(page)
  await page.getByRole('combobox', { name: '球种' }).selectOption('clear')
  await commitSandboxShot(page)
  await expect(page.getByRole('button', { name: /分支比较/ })).toBeVisible()
  await page.getByRole('button', { name: /分支比较/ }).first().click()
  await expect(page.getByText('分支跑位对比')).toBeVisible()
  page.once('dialog', (dialog) => void dialog.accept('五拍分支验收'))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.reload()
  await expect(page.getByText('5 拍 · 可分支')).toBeVisible()
  await page.getByRole('link', { name: '我的局面' }).click()
  await expect(page.getByRole('heading', { name: '五拍分支验收' })).toBeVisible()
  expect(errors).toEqual([])
})

test('预设教学仍可发接发、选择回应并保存旧局面', async ({ page }) => {
  const errors = errorsFor(page)
  await page.goto('./')
  await page.getByRole('button', { name: /低发球 → 接发 → 第三拍/ }).click()
  await expect(page).toHaveURL(/#\/lesson$/)
  await page.getByRole('button', { name: '分析这一拍' }).click()
  await page.getByRole('button', { name: /低发球到中线/ }).click()
  await expect(page.locator('.response-list button').first()).toBeVisible()
  await page.locator('.response-list button').first().click()
  const chooser = page.getByRole('dialog', { name: '选择下一拍接球者' })
  if (await chooser.isVisible()) {
    const candidate = chooser.getByRole('button', { name: /可接|假设/ })
    if (await candidate.count()) await candidate.first().click()
    else await chooser.getByRole('button', { name: '按估计落地' }).click()
  }
  await expect(page.locator('.timeline-steps span')).toHaveCount(2)
  await page.getByRole('button', { name: '保存局面' }).click()
  await page.getByRole('dialog', { name: '保存战术局面' }).getByLabel('局面名称').fill('旧版教学存档')
  await page.getByRole('dialog', { name: '保存战术局面' }).getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('status')).toContainText('战术局面已保存到本设备浏览器。')
  await page.reload()
  await page.getByRole('link', { name: '我的局面' }).click()
  await expect(page.getByRole('heading', { name: '旧版教学存档' })).toBeVisible()
  await page.getByRole('button', { name: '从此局面新建回合' }).click()
  await expect(page).toHaveURL(/#\/board\?scenario=/)
  await page.getByRole('link', { name: '战术依据', exact: true }).click()
  await expect(page.getByRole('heading', { name: '当前竞赛规则依据版本' })).toBeVisible()
  expect(errors).toEqual([])
})

test('相同局面在手机和大屏得到完全相同的逐拍结果', async ({ page }) => {
  const resultAt = async (width: number, height: number) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/board')
    await page.reload()
    await page.getByRole('button', { name: '画球路' }).last().click()
    await page.locator('.sandbox-suggestions button').first().click()
    await page.getByRole('button', { name: '确认球种并分析这一拍' }).click()
    const receivers = page.getByRole('button', { name: /可接 ·/ })
    if (await receivers.count() > 1) await receivers.first().click()
    return page.locator('.sandbox-result').innerText()
  }
  const desktop = await resultAt(1920, 1080)
  const mobile = await resultAt(390, 844)
  expect(mobile).toBe(desktop)
})

test('保持原位作为运动约束进入实际回合', async ({ page }) => {
  await page.goto('./#/board')
  await page.getByRole('checkbox', { name: 'A 保持原位' }).check()
  await page.locator('.sandbox-suggestions button').first().click()
  await page.getByRole('button', { name: '确认球种并分析这一拍' }).click()
  const receivers = page.getByRole('button', { name: /可接 ·/ })
  if (await receivers.count() > 1) await receivers.first().click()
  await page.getByRole('button', { name: '执行这一拍并继续' }).click()
  await expect(page.locator('.sandbox-result summary').filter({ hasText: /A · .*保持原位/ })).toBeVisible()
})

for (const [label, width, height] of [
  ['手机竖屏', 390, 844],
  ['手机横屏', 844, 390],
  ['笔记本', 1366, 768],
  ['大屏', 1920, 1080],
] as const) {
  test(label + '自由推演球场可用且没有横向溢出', async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('./#/board')
    await expect(page.getByRole('img', { name: /可拖动并手绘球路/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '画球路' }).last()).toBeVisible()
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    expect(size.scroll).toBeLessThanOrEqual(size.viewport + 1)
  })
}
