// popup.js - BotShield Settings & Master GitHub Sync
document.addEventListener('DOMContentLoaded', async () => {
  const toggleEnabled = document.getElementById('toggleEnabled');
  const blockedCount = document.getElementById('blockedCount');
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const modeCollapse = document.getElementById('modeCollapse');
  const modeHide = document.getElementById('modeHide');
  const addHandleForm = document.getElementById('addHandleForm');
  const newHandleInput = document.getElementById('newHandleInput');
  const submitHandleBtn = document.getElementById('submitHandleBtn');
  const handlesCount = document.getElementById('handlesCount');
  const handlesList = document.getElementById('handlesList');
  const emptyState = document.getElementById('emptyState');
  const exportImportBtn = document.getElementById('exportImportBtn');
  const batchArea = document.getElementById('batchArea');
  const batchInput = document.getElementById('batchInput');
  const saveBatchBtn = document.getElementById('saveBatchBtn');
  const cancelBatchBtn = document.getElementById('cancelBatchBtn');
  const modeBadge = document.getElementById('modeBadge');
  const syncStatusText = document.getElementById('syncStatusText');
  const commitNote = document.getElementById('commitNote');
  const toast = document.getElementById('toast');

  let state = {
    enabled: true,
    mode: 'collapse',
    blockedHandles: [],
    sessionBlockedCount: 0,
    config: null
  };

  function showToast(message, type = 'success', duration = 3000) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    if (duration > 0) {
      setTimeout(() => {
        toast.className = 'toast hidden';
      }, duration);
    }
  }

  function cleanHandle(raw) {
    if (!raw) return '';
    return raw.trim().replace(/^@+/, '').replace(/^\/+/, '').split('/')[0].split('?')[0].toLowerCase();
  }

  function renderList() {
    handlesCount.textContent = state.blockedHandles.length;
    handlesList.innerHTML = '';

    if (state.blockedHandles.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');

      state.blockedHandles.forEach((handle) => {
        const li = document.createElement('li');
        li.className = 'handle-item';
        li.innerHTML = `
          <span class="handle-name">@${handle}</span>
          <button class="delete-btn" data-handle="${handle}" title="Remove account">✕</button>
        `;
        handlesList.appendChild(li);
      });
    }
  }

  function updateModeUI(mode) {
    state.mode = mode;
    if (mode === 'hide') {
      modeHide.classList.add('active');
      modeCollapse.classList.remove('active');
    } else {
      modeCollapse.classList.add('active');
      modeHide.classList.remove('active');
    }
  }

  // Check Sync & Maintainer Config
  try {
    state.config = await GitHubSync.getConfig();
    if (state.config && state.config.isMaintainer) {
      modeBadge.textContent = 'Maintainer';
      modeBadge.className = 'mode-badge badge-maintainer';
      syncStatusText.textContent = `${state.config.owner}/${state.config.repo} (Write)`;
      commitNote.textContent = 'Auto-commits to GitHub';
      commitNote.style.display = 'block';
    } else if (state.config) {
      modeBadge.textContent = 'Public Sync';
      modeBadge.className = 'mode-badge badge-user';
      syncStatusText.textContent = `${state.config.owner}/${state.config.repo} (Read)`;
      commitNote.textContent = 'Local block';
    } else {
      modeBadge.textContent = 'Offline';
      modeBadge.className = 'mode-badge badge-user';
      syncStatusText.textContent = 'Local only (No GitHub configured)';
      commitNote.textContent = 'Local block';
    }
  } catch (e) {
    console.error('Config load error:', e);
  }

  // Load from chrome.storage.local
  chrome.storage.local.get(['enabled', 'mode', 'blockedHandles', 'sessionBlockedCount'], (res) => {
    if (typeof res.enabled === 'boolean') {
      state.enabled = res.enabled;
    }
    toggleEnabled.checked = state.enabled;

    if (res.mode) {
      updateModeUI(res.mode);
    }

    if (Array.isArray(res.blockedHandles)) {
      state.blockedHandles = res.blockedHandles;
    } else {
      state.blockedHandles = [];
    }
    renderList();

    if (typeof res.sessionBlockedCount === 'number') {
      state.sessionBlockedCount = res.sessionBlockedCount;
      blockedCount.textContent = state.sessionBlockedCount;
    }
  });

  // Sync with Remote GitHub Blocklist (Exact 1:1 Cloud Mirror)
  async function performSync() {
    try {
      showToast('Syncing with GitHub cloud...', 'loading', 0);
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = 'Syncing...';

      const remoteHandles = await GitHubSync.fetchRemoteBlocklist();
      state.blockedHandles = remoteHandles;

      chrome.storage.local.set({ blockedHandles: state.blockedHandles }, () => {
        renderList();
        showToast(`Synced ${remoteHandles.length} accounts from GitHub!`, 'success');
      });
    } catch (err) {
      console.error('Sync failed:', err);
      showToast(err.message || 'Failed to sync with GitHub', 'error');
    } finally {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = '⟳ Sync DB';
    }
  }

  syncNowBtn.addEventListener('click', performSync);

  // Toggle Extension On/Off
  toggleEnabled.addEventListener('change', () => {
    state.enabled = toggleEnabled.checked;
    chrome.storage.local.set({ enabled: state.enabled });
  });

  // Mode Selection
  modeCollapse.addEventListener('click', () => {
    updateModeUI('collapse');
    chrome.storage.local.set({ mode: 'collapse' });
  });

  modeHide.addEventListener('click', () => {
    updateModeUI('hide');
    chrome.storage.local.set({ mode: 'hide' });
  });

  // Reset Stats Counter
  resetStatsBtn.addEventListener('click', () => {
    state.sessionBlockedCount = 0;
    blockedCount.textContent = '0';
    chrome.storage.local.set({ sessionBlockedCount: 0 });
  });

  // Add Single Handle (with automatic GitHub commit in Maintainer mode)
  addHandleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const handle = cleanHandle(newHandleInput.value);
    if (!handle) return;

    if (state.blockedHandles.includes(handle)) {
      showToast(`@${handle} is already in the list`, 'error');
      newHandleInput.value = '';
      return;
    }

    const enteredHandle = handle;
    newHandleInput.value = '';

    // If maintainer mode with GitHub token, commit directly to GitHub
    if (state.config && state.config.isMaintainer) {
      submitHandleBtn.disabled = true;
      showToast(`Committing @${enteredHandle} to GitHub...`, 'loading', 0);
      try {
        const result = await GitHubSync.pushHandleToGitHub(enteredHandle);
        state.blockedHandles = result.handles;
        chrome.storage.local.set({ blockedHandles: state.blockedHandles });
        renderList();
        showToast(`Committed @${enteredHandle} to GitHub!`, 'success');
      } catch (err) {
        console.error('GitHub push error:', err);
        showToast(`GitHub error: ${err.message}`, 'error', 4000);
      } finally {
        submitHandleBtn.disabled = false;
      }
    } else {
      state.blockedHandles.unshift(enteredHandle);
      chrome.storage.local.set({ blockedHandles: state.blockedHandles });
      renderList();
      showToast(`Added @${enteredHandle} locally`, 'success');
    }
  });

  // Delete Individual Handle
  handlesList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const handleToDelete = e.target.getAttribute('data-handle');
      
      if (state.config && state.config.isMaintainer) {
        showToast(`Removing @${handleToDelete} from GitHub...`, 'loading', 0);
        try {
          const res = await GitHubSync.removeHandleFromGitHub(handleToDelete);
          state.blockedHandles = res.handles;
          chrome.storage.local.set({ blockedHandles: state.blockedHandles });
          renderList();
          showToast(`Removed @${handleToDelete} from GitHub!`, 'success');
        } catch (err) {
          showToast(`Error deleting from GitHub: ${err.message}`, 'error');
        }
      } else {
        state.blockedHandles = state.blockedHandles.filter(h => h !== handleToDelete);
        chrome.storage.local.set({ blockedHandles: state.blockedHandles });
        renderList();
      }
    }
  });

  // Batch Import/Export Toggle
  exportImportBtn.addEventListener('click', () => {
    const isHidden = batchArea.classList.contains('hidden');
    if (isHidden) {
      batchInput.value = state.blockedHandles.map(h => `@${h}`).join('\n');
      batchArea.classList.remove('hidden');
      batchInput.focus();
    } else {
      batchArea.classList.add('hidden');
    }
  });

  cancelBatchBtn.addEventListener('click', () => {
    batchArea.classList.add('hidden');
  });

  saveBatchBtn.addEventListener('click', () => {
    const rawText = batchInput.value;
    const tokens = rawText.split(/[\n,;\s]+/);
    const unique = new Set();
    tokens.forEach(tok => {
      const h = cleanHandle(tok);
      if (h) unique.add(h);
    });

    state.blockedHandles = Array.from(unique).sort();
    chrome.storage.local.set({ blockedHandles: state.blockedHandles }, () => {
      renderList();
      batchArea.classList.add('hidden');
      showToast(`Updated list with ${state.blockedHandles.length} accounts!`, 'success');
    });
  });
});
