// github-sync.js - GitHub Master Blocklist Sync & Commit Engine

const GitHubSync = {
  // Load configuration (prioritizing local maintainer file)
  async getConfig() {
    try {
      const localUrl = chrome.runtime.getURL('config.local.json');
      const res = await fetch(localUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.githubToken && data.githubToken !== 'PASTE_YOUR_GITHUB_TOKEN_HERE') {
          return {
            isMaintainer: true,
            owner: data.githubOwner,
            repo: data.githubRepo,
            branch: data.githubBranch || 'main',
            path: data.githubPath || 'blocklist.json',
            token: data.githubToken
          };
        }
      }
    } catch (e) {
      // Local maintainer file doesn't exist, proceed to public config
    }

    // Fallback to public config for distributed users
    try {
      const pubUrl = chrome.runtime.getURL('config.json');
      const res = await fetch(pubUrl);
      if (res.ok) {
        const data = await res.json();
        return {
          isMaintainer: false,
          owner: data.githubOwner,
          repo: data.githubRepo,
          branch: data.githubBranch || 'main',
          path: data.githubPath || 'blocklist.json',
          publicRawUrl: data.publicRawUrl || `https://raw.githubusercontent.com/${data.githubOwner}/${data.githubRepo}/${data.githubBranch || 'main'}/${data.githubPath || 'blocklist.json'}`
        };
      }
    } catch (e) {
      console.warn('BotShield: No remote config found, using local-only mode');
    }

    return null;
  },

  // Fetch blocklist from GitHub (works for both public users and maintainers)
  async fetchRemoteBlocklist() {
    const config = await this.getConfig();
    if (!config) throw new Error('Remote configuration not found.');

    let jsonContent = null;

    if (config.isMaintainer && config.token) {
      // Fetch via GitHub REST API with fresh cache
      const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`GitHub API error (${res.status}): ${err.message || res.statusText}`);
      }

      const fileData = await res.json();
      const rawStr = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
      jsonContent = JSON.parse(rawStr);
    } else {
      // Public user fetch from raw CDN with cache buster
      const url = `${config.publicRawUrl}?_t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch public blocklist (${res.status})`);
      }
      jsonContent = await res.json();
    }

    // Handles can be array or { handles: [...] }
    const handles = Array.isArray(jsonContent) ? jsonContent : (jsonContent.handles || []);
    return handles.map(h => String(h).trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
  },

  // Push new handle directly to GitHub repository (Maintainer mode only)
  async pushHandleToGitHub(newHandle) {
    const config = await this.getConfig();
    if (!config || !config.isMaintainer || !config.token) {
      throw new Error('Maintainer mode disabled. Add your GitHub token in config.local.json to commit.');
    }

    const cleanHandle = String(newHandle).trim().replace(/^@/, '').toLowerCase();
    if (!cleanHandle) throw new Error('Invalid handle provided.');

    // 1. Fetch current file content and SHA
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}?ref=${config.branch}`;
    const getRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let currentData = { version: '1.0.0', updatedAt: new Date().toISOString(), handles: [] };
    let fileSha = null;

    if (getRes.ok) {
      const fileData = await getRes.json();
      fileSha = fileData.sha;
      try {
        const rawStr = decodeURIComponent(escape(atob(fileData.content.replace(/\s/g, ''))));
        currentData = JSON.parse(rawStr);
      } catch (e) {
        currentData = { handles: [] };
      }
    } else if (getRes.status !== 404) {
      const err = await getRes.json().catch(() => ({}));
      throw new Error(`Failed to query repository: ${err.message || getRes.statusText}`);
    }

    // Normalize existing handles
    const existingHandles = new Set(
      (Array.isArray(currentData) ? currentData : (currentData.handles || []))
        .map(h => String(h).trim().replace(/^@/, '').toLowerCase())
    );

    if (existingHandles.has(cleanHandle)) {
      return { added: false, message: `@${cleanHandle} is already on the remote blocklist.` };
    }

    existingHandles.add(cleanHandle);
    const sortedHandles = Array.from(existingHandles).sort();

    const updatedPayload = {
      version: currentData.version || '1.0.0',
      updatedAt: new Date().toISOString(),
      description: currentData.description || 'Curated list of coordinated bot accounts on X / Twitter.',
      handles: sortedHandles
    };

    const formattedJson = JSON.stringify(updatedPayload, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(formattedJson)));

    // 2. Commit update to GitHub via PUT
    const putBody = {
      message: `chore(botshield): add @${cleanHandle} to blocklist`,
      content: base64Content,
      branch: config.branch
    };

    if (fileSha) {
      putBody.sha = fileSha;
    }

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(`Failed to commit to GitHub (${putRes.status}): ${err.message || putRes.statusText}`);
    }

    return { added: true, handles: sortedHandles };
  }
};

// Export for use in popup and background scripts
if (typeof module !== 'undefined') {
  module.exports = GitHubSync;
}
