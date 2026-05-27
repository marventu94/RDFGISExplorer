import { test, expect } from '@playwright/test';
import { clearDashboards, waitForRemotes } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('RDF Explorer flow', () => {
  test('saves workspace and reopens from welcome card with restored state', async ({ page }) => {
    page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
    page.on('console', (msg) => console.log(`[console ${msg.type()}] ${msg.text()}`));
    await page.goto('/explorer');

    // Verify explorer loads: tab panel and canvas should be visible
    await expect(page.locator('.panel-tabs')).toBeVisible();
    await expect(page.locator('app-canvas-panel')).toBeVisible();

    // Save workspace
    await page.locator('button.save-btn').click();

    // Fill the save dialog
    const dialog = page.locator('.dialog-container');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="text"]').fill('E2E Explorer Workspace');
    await dialog.locator('button:has-text("Guardar")').click();

    // Wait for save confirmation (snackbar or URL update)
    await expect(page).toHaveURL(/workspaceId=/);

    // Extract workspace id from URL
    const url = page.url();
    const workspaceId = new URL(url).searchParams.get('workspaceId');
    expect(workspaceId).toBeTruthy();

    // Go back to welcome
    await page.goto('/');

    // Card should be visible
    await expect(page.locator('app-dashboard-card:has-text("E2E Explorer Workspace")')).toBeVisible();

    // Open from card
    await page.locator('app-dashboard-card:has-text("E2E Explorer Workspace")').click();

    // Should redirect to explorer with workspaceId
    await expect(page).toHaveURL(new RegExp(`workspaceId=${workspaceId}`));

    // Verify restored state: the panel tab name should still be visible
    await expect(page.locator('.panel-tabs')).toBeVisible();
    await expect(page.locator('text=Panel 1')).toBeVisible();
  });
});
