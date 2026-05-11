// AI TimeTracker start-server.js (macOS)
// Loads env vars from ~/.timetracker/.env.local before starting Next.js server.
const fs = require('fs');
const path = require('path');

const dataDir = process.env.TIMETRACKER_DATA_DIR || path.join(require('os').homedir(), '.timetracker');
// Export so the Next.js process (settings PUT) writes back to the SAME file we read from.
// Without this, UI saves to process.cwd()/.env.local which is never read by start-server.
process.env.TIMETRACKER_DATA_DIR = dataDir;
const envFile = path.join(dataDir, '.env.local');

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf-8').split(/\r?\n/);
  let loaded = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) {
        process.env[key] = val;
        loaded++;
      }
    }
  }
  console.log(`[start-server] Loaded ${loaded} env vars from ${envFile}`);
} else {
  console.log(`[start-server] No ${envFile} found — using system env vars only`);
  console.log('[start-server] First run? Configure your API tokens in ~/.timetracker/.env.local');
}

// Log Jira config status
const jiraUrl = process.env.JIRA_BASE_URL;
const jiraEmail = process.env.JIRA_SERVICE_EMAIL;
const jiraKey = process.env.JIRA_API_KEY;
if (jiraUrl && jiraEmail && jiraKey) {
  console.log(`[start-server] Jira: configured (${jiraUrl})`);
} else {
  const missing = [];
  if (!jiraUrl) missing.push('JIRA_BASE_URL');
  if (!jiraEmail) missing.push('JIRA_SERVICE_EMAIL');
  if (!jiraKey) missing.push('JIRA_API_KEY');
  console.log(`[start-server] WARNING: Jira not fully configured — missing: ${missing.join(', ')}`);
}

// Start the Next.js server
require('./app/apps/web/server.js');
