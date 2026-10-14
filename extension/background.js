// background.js - Background Service Worker for periodic GitHub blocklist sync
importScripts('github-sync.js');

const ALARM_NAME = 'botshield_sync_alarm';
const SYNC_INTERVAL_MINUTES = 360; // Sync every 6 hours

// Perform background sync from remote GitHub blocklist
async function syncFromGitHub() {
  try {
    const remoteHandles = await GitHubSync.fetchRemoteBlocklist();
    if (Array.isArray(remoteHandles) && remoteHandles.length > 0) {
      chrome.storage.local.get(['blockedHandles'], (res) => {
        const existing = res.blockedHandles || [];
        const merged = Array.from(new Set([...existing, ...remoteHandles])).sort();
        chrome.storage.local.set({
          blockedHandles: merged,
          lastSyncTime: new Date().toISOString()
        });
        console.log(`[BotShield] Auto-synced ${remoteHandles.length} handles from GitHub.`);
      });
    }
  } catch (err) {
    console.warn('[BotShield] Background sync error:', err.message);
  }
}

// On Extension Installed or Updated
chrome.runtime.onInstalled.addListener(() => {
  // Create periodic alarm
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES
  });

  // Perform initial sync
  syncFromGitHub();
});

// Alarm Listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    syncFromGitHub();
  }
});
