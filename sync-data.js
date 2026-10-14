// sync-data.js - CLI Tool to pull/push the master blocklist from the cloud 'data' branch
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_DATA_FILE = path.join(DATA_DIR, 'blocklist.local.json');
const CONFIG_FILE = path.join(__dirname, 'extension', 'config.local.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('Missing extension/config.local.json. Please ensure credentials are set.');
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

async function pullData() {
  const config = loadConfig();
  console.log(`[Pull] Fetching blocklist from branch '${config.githubBranch}' of ${config.githubOwner}/${config.githubRepo}...`);

  const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${config.githubPath}?ref=${config.githubBranch}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BotShield-CLI'
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch from GitHub (${res.status}): ${err.message || res.statusText}`);
  }

  const fileData = await res.json();
  const rawStr = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
  const parsed = JSON.parse(rawStr);

  // Write to local gitignored file
  fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
  console.log(`✓ Successfully pulled ${parsed.handles.length} handles into data/blocklist.local.json`);
  console.log(`  Last updated in cloud: ${parsed.updatedAt}`);
}

async function pushData() {
  const config = loadConfig();
  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    throw new Error(`Cannot find local file: ${LOCAL_DATA_FILE}. Run --pull first.`);
  }

  const localContent = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, 'utf8'));
  const rawHandles = (Array.isArray(localContent) ? localContent : localContent.handles) || [];
  
  // Clean, deduplicate, and sort
  const cleaned = Array.from(new Set(
    rawHandles.map(h => String(h).trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
  )).sort();

  console.log(`[Push] Preparing to upload ${cleaned.length} handles to branch '${config.githubBranch}'...`);

  // Fetch current SHA
  const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/contents/${config.githubPath}?ref=${config.githubBranch}`;
  const getRes = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BotShield-CLI'
    }
  });

  let fileSha = null;
  if (getRes.ok) {
    const fileData = await getRes.json();
    fileSha = fileData.sha;
  }

  const payload = {
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    description: 'Curated list of coordinated bot accounts on X / Twitter.',
    handles: cleaned
  };

  const formattedJson = JSON.stringify(payload, null, 2);
  const base64Content = Buffer.from(formattedJson).toString('base64');

  const putBody = {
    message: `chore(data): batch update blocklist (${cleaned.length} handles)`,
    content: base64Content,
    branch: config.githubBranch
  };
  if (fileSha) putBody.sha = fileSha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${config.githubToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'BotShield-CLI'
    },
    body: JSON.stringify(putBody)
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`Failed to commit to GitHub (${putRes.status}): ${err.message || putRes.statusText}`);
  }

  // Update local file with formatted version
  fs.writeFileSync(LOCAL_DATA_FILE, formattedJson, 'utf8');
  console.log(`✓ Successfully pushed ${cleaned.length} handles to GitHub 'data' branch!`);
}

// CLI handler
const arg = process.argv[2];
(async () => {
  try {
    if (arg === '--pull' || arg === '-p') {
      await pullData();
    } else if (arg === '--push' || arg === '-u') {
      await pushData();
    } else {
      console.log(`
BotShield Data Sync Tool
------------------------
Usage:
  node sync-data.js --pull    Pull latest blocklist from cloud 'data' branch to data/blocklist.local.json
  node sync-data.js --push    Push local data/blocklist.local.json back to cloud 'data' branch
      `);
    }
  } catch (err) {
    console.error(`Error:`, err.message);
    process.exit(1);
  }
})();
