import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DASHBOARDS_DB = path.resolve(__dirname, '../../backend/data/dashboards.sqlite');
const ROOT = path.resolve(__dirname, '../..');

async function globalSetup(): Promise<void> {
  // Remove dashboards SQLite to start with a clean state for every test run
  if (fs.existsSync(DASHBOARDS_DB)) {
    fs.unlinkSync(DASHBOARDS_DB);
  }

  // Build remotes for static serving during E2E
  console.log('Building remotes for E2E...');
  execSync('npm run e2e:build-remotes', { cwd: ROOT, stdio: 'inherit' });
}

export default globalSetup;
