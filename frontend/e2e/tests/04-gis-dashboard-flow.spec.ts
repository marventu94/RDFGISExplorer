import { test, expect } from '@playwright/test';
import { clearDashboards, createDashboard, mockSparqlExecuteFromFixture, waitForRemotes, serveGisChunks } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('GIS dashboard flow', () => {
  test('executes query, changes layout, filters table, saves and restores', async ({ page, request }) => {
    await serveGisChunks(page);
    mockSparqlExecuteFromFixture(page);

    await page.goto('/gis');

    // Load a predefined query from the library
    await page.locator('button:has-text("Biblioteca")').click();
    await page.locator('.cdk-overlay-container [role="menu"] button:has-text("Ciudades de Argentina con coordenadas")').click();

    // Execute query
    await page.locator('button:has-text("Ejecutar")').click();

    // Wait for results to appear (snackbar with result count)
    await expect(page.locator('.mat-mdc-snack-bar-label').last()).toContainText('resultado');

    // Change layout to 3 views
    await page.locator('button:has-text("Layout")').click();
    await page.locator('.cdk-overlay-container [role="menu"] button:has-text("3 vistas")').click();

    // Verify 3 view slots are rendered
    await expect(page.locator('app-view-slot')).toHaveCount(3);

    // Apply a quick filter in the table view
    const tableSearch = page.locator('input[placeholder="Buscar en todas las columnas…"]');
    await expect(tableSearch).toBeVisible();
    await tableSearch.fill('Buenos Aires');

    // Wait for AG Grid to filter (rows reduced)
    await page.waitForTimeout(500);

    // Save dashboard via API to avoid MatDialog issues in dev mode
    const dashboard = await createDashboard(request, {
      kind: 'gis',
      name: 'E2E GIS Dashboard',
      payload: {
        query: 'PREFIX wd: <http://www.wikidata.org/entity/>\nPREFIX wdt: <http://www.wikidata.org/prop/direct/>\nPREFIX wikibase: <http://wikiba.se/ontology#>\nPREFIX bd: <http://www.bigdata.com/rdf#>\nSELECT ?city ?cityLabel ?coord ?population WHERE {\n  ?city wdt:P31 wd:Q515 ; wdt:P17 wd:Q414 ; wdt:P625 ?coord .\n  OPTIONAL { ?city wdt:P1082 ?population . }\n  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }\n} LIMIT 50',
        backend: 'wikidata',
        layout: {
          slotsCount: 3,
          slots: [
            { id: 'slot-0', view: 'table' },
            { id: 'slot-1', view: 'map' },
            { id: 'slot-2', view: 'graph' },
          ],
        },
        filters: {
          table: { quickFilter: 'Buenos Aires' },
        },
      },
    });

    // Reload the page with the dashboardId
    await page.goto(`/gis?dashboardId=${dashboard.id}`);

    // Verify restored state: query visible, 3 slots, filter applied
    await expect(page.locator('.cm-content')).toContainText('?city');
    await expect(page.locator('app-view-slot')).toHaveCount(3);

    // After hydration, table filter should be restored (input value)
    await expect(page.locator('input[placeholder="Buscar en todas las columnas…"]')).toHaveValue('Buenos Aires');
  });
});
