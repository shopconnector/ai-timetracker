// AI TimeTracker start-server.js (macOS)
// Loads env vars in priority order:
//   1. .env.production from the bundle (baked-in defaults — OAuth client secrets etc.)
//   2. ~/.timetracker/.env.local (user-specific overrides — Jira creds, etc.)
const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath, overwrite) {
  if (!fs.existsSync(filePath)) return 0;
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
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
      if (val && (overwrite || !process.env[key])) {
        process.env[key] = val;
        loaded++;
      }
    }
  }
  return loaded;
}

// 1. Bundle defaults from .env.production (do NOT overwrite anything already set)
const bundleEnvFile = path.join(__dirname, 'app', 'apps', 'web', '.env.production');
const bundleLoaded = loadEnvFile(bundleEnvFile, false);
if (bundleLoaded > 0) {
  console.log(`[start-server] Loaded ${bundleLoaded} baked env vars from ${bundleEnvFile}`);
} else {
  console.log(`[start-server] No ${bundleEnvFile} (or empty)`);
}

// 2. User overrides from ~/.timetracker/.env.local
const dataDir = process.env.TIMETRACKER_DATA_DIR || path.join(require('os').homedir(), '.timetracker');
// Export so the Next.js process (settings PUT) writes back to the SAME file we read from.
process.env.TIMETRACKER_DATA_DIR = dataDir;
const userEnvFile = path.join(dataDir, '.env.local');
const userLoaded = loadEnvFile(userEnvFile, true);
if (userLoaded > 0) {
  console.log(`[start-server] Loaded ${userLoaded} user env vars from ${userEnvFile}`);
} else if (!fs.existsSync(userEnvFile)) {
  console.log(`[start-server] No ${userEnvFile} found — using bundle defaults + system env only`);
  console.log('[start-server] First run? Click Connect with Atlassian/Tempo in Settings to authenticate.');
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
