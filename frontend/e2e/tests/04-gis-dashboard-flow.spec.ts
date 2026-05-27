import { test, expect } from '@playwright/test';
import { clearDashboards, mockSparqlExecuteFromFixture, waitForRemotes } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('GIS dashboard flow', () => {
  test('executes query, changes layout, filters table, saves and restores', async ({ page }) => {
    mockSparqlExecuteFromFixture(page);

    await page.goto('/gis');

    // Load a predefined query from the library
    await page.locator('button:has-text("Biblioteca")').click();
    await page.locator('mat-menu button:has-text("Ciudades de Argentina")').click();

    // Execute query
    await page.locator('button:has-text("Ejecutar")').click();

    // Wait for results to appear (snackbar with result count)
    await expect(page.locator('text=resultado')).toBeVisible();

    // Change layout to 3 views
    await page.locator('button:has-text("Layout")').click();
    await page.locator('mat-menu button:has-text("3 vistas")').click();

    // Verify 3 view slots are rendered
    await expect(page.locator('app-view-slot')).toHaveCount(3);

    // Apply a quick filter in the table view
    const tableSearch = page.locator('input[placeholder="Buscar en todas las columnas…"]');
    await expect(tableSearch).toBeVisible();
    await tableSearch.fill('Buenos Aires');

    // Wait for AG Grid to filter (rows reduced)
    await page.waitForTimeout(500);

    // Save dashboard
    await page.locator('button:has-text("Guardar tablero")').click();
    const saveDialog = page.locator('mat-dialog-container');
    await expect(saveDialog).toBeVisible();
    await saveDialog.locator('input').fill('E2E GIS Dashboard');
    await saveDialog.locator('button:has-text("Guardar")').click();

    // Wait for save confirmation and URL update
    await expect(page).toHaveURL(/dashboardId=/);
    const dashboardId = new URL(page.url()).searchParams.get('dashboardId');
    expect(dashboardId).toBeTruthy();

    // Reload the page with the dashboardId
    await page.reload();

    // Verify restored state: query visible, 3 slots, filter applied
    await expect(page.locator('.cm-content')).toContainText('?city');
    await expect(page.locator('app-view-slot')).toHaveCount(3);

    // After hydration, table filter should be restored (input value)
    await expect(page.locator('input[placeholder="Buscar en todas las columnas…"]')).toHaveValue('Buenos Aires');
  });
});
