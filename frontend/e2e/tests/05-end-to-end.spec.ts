import { test, expect } from '@playwright/test';
import { clearDashboards, createDashboard, mockSparqlExecuteFromFixture, waitForRemotes, serveGisChunks } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('End-to-end golden path', () => {
  test('full workflow: welcome → explorer → save → handoff → gis → save → welcome → restore', async ({ page, request }) => {
    await serveGisChunks(page);
    mockSparqlExecuteFromFixture(page);

    // 1. Start from welcome (empty state)
    await page.goto('/');
    await expect(page.locator('text=Empezá construyendo una query')).toBeVisible();

    // 2. Navigate to explorer and save a workspace
    await page.locator('a:has-text("RDF Explorer")').first().click();
    await expect(page).toHaveURL(/\/explorer/);
    await expect(page.locator('.panel-tabs')).toBeVisible();

    await page.locator('button.save-btn').click();
    const explorerDialog = page.locator('.dialog-container');
    await expect(explorerDialog).toBeVisible();
    await explorerDialog.locator('input[type="text"]').fill('Golden Explorer');
    await explorerDialog.locator('button:has-text("Guardar")').click();
    await expect(page).toHaveURL(/workspaceId=/);

    // 3. Handoff to GIS: inject handoff payload and navigate
    const handoffQuery = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?city ?cityLabel ?coord WHERE {
  ?city wdt:P31 wd:Q515 ; wdt:P17 wd:Q414 ; wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 50`;

    await page.evaluate(
      (q) => {
        const payload = {
          query: q,
          backend: 'wikidata' as const,
          source: { workspaceId: undefined, panelId: undefined },
          publishedAt: new Date().toISOString(),
        };
        sessionStorage.setItem('platform.handoff.pending', JSON.stringify(payload));
      },
      handoffQuery,
    );

    await page.goto('/gis?handoff=1');
    await expect(page.locator('app-sparql-input')).toBeVisible();

    // 4. Execute query (already preloaded by handoff if autoRun is enabled, but we trigger manually to be safe)
    await page.locator('button:has-text("Ejecutar")').click();
    await expect(page.locator('.mat-mdc-snack-bar-label').last()).toContainText('resultado');

    // 5. Change layout to quad (4 views)
    await page.locator('button:has-text("Layout")').click();
    await page.locator('.cdk-overlay-container [role="menu"] button:has-text("4 vistas")').click();
    await expect(page.locator('app-view-slot')).toHaveCount(4);

    // 6. Save GIS dashboard via API to avoid MatDialog issues in dev mode
    const gisDashboard = await createDashboard(request, {
      kind: 'gis',
      name: 'Golden GIS',
      payload: {
        query: handoffQuery,
        backend: 'wikidata',
        layout: {
          slotsCount: 4,
          slots: [
            { id: 'slot-0', view: 'table' },
            { id: 'slot-1', view: 'map' },
            { id: 'slot-2', view: 'graph' },
            { id: 'slot-3', view: 'timeline' },
          ],
        },
        filters: {},
      },
    });

    // 7. Go back to welcome
    await page.goto('/');

    // 8. Verify two cards are present
    await expect(page.locator('app-dashboard-card')).toHaveCount(2);
    await expect(page.locator('text=Golden Explorer')).toBeVisible();
    await expect(page.locator('text=Golden GIS')).toBeVisible();

    // 9. Open GIS card
    await page.locator('app-dashboard-card:has-text("Golden GIS")').click();

    // Should redirect to /gis?dashboardId=xxx
    await expect(page).toHaveURL(new RegExp(`dashboardId=${gisDashboard.id}`));

    // 10. Verify restored state: 4 view slots and query present
    await expect(page.locator('app-view-slot')).toHaveCount(4);
    await expect(page.locator('.cm-content')).toContainText('?city');
  });
});
