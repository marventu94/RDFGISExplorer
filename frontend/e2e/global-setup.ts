import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_DB = path.resolve(__dirname, '../../backend/data/dashboards.sqlite');

async function globalSetup(): Promise<void> {
  // Remove dashboards SQLite to start with a clean state for every test run
  if (fs.existsSync(DASHBOARDS_DB)) {
    fs.unlinkSync(DASHBOARDS_DB);
  }
}

export default globalSetup;
