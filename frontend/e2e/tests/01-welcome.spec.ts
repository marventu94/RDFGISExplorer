import { test, expect } from '@playwright/test';
import { clearDashboards, createDashboard, waitForRemotes } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('Welcome page', () => {
  test('shows empty state and CTAs when no dashboards exist', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to be fully rendered
    await expect(page.locator('text=Construir query')).toBeVisible();
    await expect(page.locator('text=Explorar en GIS')).toBeVisible();

    // Empty state should be visible
    await expect(page.locator('text=Empezá construyendo una query')).toBeVisible();
    await expect(page.locator('a:has-text("Ir a RDF Explorer")')).toBeVisible();

    // No cards should be present
    await expect(page.locator('app-dashboard-card')).toHaveCount(0);
  });

  test('displays recent dashboards and allows filtering', async ({ page, request }) => {
    // Seed two dashboards
    await createDashboard(request, {
      kind: 'explorer',
      name: 'Explorer Test',
      payload: { panels: [], activePanelId: 'panel-0', settings: {} },
    });
    await createDashboard(request, {
      kind: 'gis',
      name: 'GIS Test',
      payload: { query: '', backend: 'wikidata', layout: { slotsCount: 1, slots: [] }, filters: {} },
    });

    await page.goto('/');

    // Both cards should appear
    await expect(page.locator('app-dashboard-card')).toHaveCount(2);
    await expect(page.locator('text=Explorer Test')).toBeVisible();
    await expect(page.locator('text=GIS Test')).toBeVisible();

    // Filter by GIS
    await page.locator('button:has-text("GIS")').click();
    await expect(page.locator('app-dashboard-card')).toHaveCount(1);
    await expect(page.locator('text=GIS Test')).toBeVisible();

    // Filter by Explorer
    await page.locator('button:has-text("Explorer")').click();
    await expect(page.locator('app-dashboard-card')).toHaveCount(1);
    await expect(page.locator('text=Explorer Test')).toBeVisible();

    // Filter by All
    await page.locator('button:has-text("Todos")').click();
    await expect(page.locator('app-dashboard-card')).toHaveCount(2);
  });

  test('navigates to explorer and gis from CTAs', async ({ page }) => {
    page.on('console', (msg) => console.log(`[console ${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

    // Quick check: can GIS load directly?
    await page.goto('http://localhost:4202');
    await page.waitForTimeout(3000);
    console.log('Direct GIS URL:', page.url());
    console.log('Direct GIS title:', await page.title());

    await page.goto('/');

    const explorerCta = page.locator('a.welcome__cta--explorer');
    await explorerCta.click();
    await expect(page).toHaveURL(/\/explorer/);

    await page.goto('/');

    const gisCta = page.locator('a.welcome__cta--gis');
    await gisCta.click();
    await expect(page).toHaveURL(/\/gis/);
  });
});
