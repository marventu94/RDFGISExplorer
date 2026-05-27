import { test, expect } from '@playwright/test';
import { waitForRemotes } from '../fixtures/seed-dashboards';

test('wait for remotes', async ({ request }) => {
  await waitForRemotes(request);
  const r1 = await request.get('http://localhost:4201/remoteEntry.json');
  console.log('Explorer remoteEntry status:', r1.status());
  const r2 = await request.get('http://localhost:4202/remoteEntry.json');
  console.log('GIS remoteEntry status:', r2.status());
  try {
    const body = await r2.json();
    console.log('GIS remoteEntry exposes:', JSON.stringify(body.exposes));
    const sharedKeys = Object.keys(body.shared || {});
    console.log('GIS remoteEntry shared count:', sharedKeys.length);
    // Check a few shared lib outFileNames
    const sample = sharedKeys.slice(0, 5).map(k => {
      const lib = body.shared[k];
      return { key: k, outFileName: lib?.outFileName, devEntryPoint: lib?.dev?.entryPoint };
    });
    console.log('GIS sample shared:', JSON.stringify(sample));
    // Try fetching one of the shared chunks directly
    if (sample[0]?.outFileName) {
      const chunkUrl = `http://localhost:4202/${sample[0].outFileName}`;
      const r3 = await request.get(chunkUrl);
      console.log('GIS chunk status:', r3.status(), 'for', chunkUrl);
    }
    // Check if any shared lib has a different path format
    const libWithPath = sharedKeys.find(k => body.shared[k]?.outFileName?.includes('/'));
    console.log('GIS shared with slash:', libWithPath ? body.shared[libWithPath].outFileName : 'none');
  } catch (e) {
    console.log('Failed to parse GIS remoteEntry');
  }
});
