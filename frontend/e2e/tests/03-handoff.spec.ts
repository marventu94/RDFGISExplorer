import { test, expect } from '@playwright/test';
import { clearDashboards, mockSparqlExecuteFromFixture, waitForRemotes } from '../fixtures/seed-dashboards';

test.beforeEach(async ({ request }) => {
  await waitForRemotes(request);
  await clearDashboards(request);
});

test.describe('Handoff Explorer → GIS', () => {
  test('transfers query from explorer to GIS', async ({ page }) => {
    const query = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?city ?cityLabel WHERE {
  ?city wdt:P31 wd:Q515 ; wdt:P17 wd:Q414 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
} LIMIT 10`;

    // Seed the handoff payload in sessionStorage as if explorer published it
    await page.goto('/');
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
      query,
    );

    // Navigate to GIS with handoff flag
    await page.goto('/gis?handoff=1');

    // Wait for the GIS app to load and consume the handoff
    await expect(page.locator('app-sparql-input')).toBeVisible();

    // Verify the query was preloaded into the CodeMirror editor
    // We check by looking for a unique snippet in the editor content via DOM
    const editorText = await page.locator('.cm-content').textContent();
    expect(editorText).toContain('?city');
  });

  test('shows snackbar when no handoff payload exists', async ({ page }) => {
    await page.goto('/gis?handoff=1');
    // Should show snackbar about missing query
    await expect(page.locator('text=No se encontró la query a importar')).toBeVisible();
  });
});
