import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:4173';
const TEST_TIMEOUT = 20000;

test.describe('Dictation Assistant', () => {
    test.skip(({ browserName }) => browserName === 'webkit', 'WebKit headless is flaky with this app');

    const ensureDashboard = async (page: import('@playwright/test').Page) => {
        await page.waitForTimeout(500);
        const cancelBtn = page.getByRole('button', { name: '取消' });
        if (await cancelBtn.count() > 0) {
            await cancelBtn.first().click();
            await page.waitForTimeout(300);
        }
        await expect(page.getByText('听写小助手')).toBeVisible({ timeout: 15000 });
    };

    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle' });
        await ensureDashboard(page);
    });

    test('app loads and shows dashboard', async ({ page }) => {
        const title = page.getByText('听写小助手');
        await expect(title).toBeVisible({ timeout: 15000 });

        const addBtn = page.getByRole('button', { name: /添加词库/ });
        await expect(addBtn).toBeVisible({ timeout: 5000 });
    });

    test('settings page shows voice and interval controls', async ({ page }) => {
        const header = page.locator('header');
        const settingsBtn = header.getByRole('button').nth(1);
        await settingsBtn.click();

        await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('发音人')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('每字间隔')).toBeVisible({ timeout: 15000 });
    });

    test('can add word group and start dictation', async ({ page }) => {
        await page.getByRole('button', { name: /添加词库/ }).click({ timeout: 15000 });
        const titleInput = page.getByRole('textbox').first();
        await titleInput.fill('Test Group');
        await page.getByRole('textbox').nth(1).fill('apple\nbanana');
        await page.getByRole('button', { name: /开始听写/ }).click({ timeout: TEST_TIMEOUT });

        const controls = page.getByRole('button', { name: /暂停|完成|继续/ });
        await expect(controls.first()).toBeVisible({ timeout: 10000 });
    });

    test('per-character interval slider is present', async ({ page }) => {
        const header = page.locator('header');
        const settingsBtn = header.getByRole('button').nth(1);
        await settingsBtn.click();
        const slider = page.locator('input[type="range"]').first();
        await expect(slider).toBeVisible({ timeout: 15000 });
    });
});
