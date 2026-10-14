// background.js - Background Service Worker for periodic GitHub blocklist sync
importScripts('github-sync.js');

const ALARM_NAME = 'botshield_sync_alarm';
const SYNC_INTERVAL_MINUTES = 360; // Sync every 6 hours

// Perform background sync from remote GitHub blocklist
async function syncFromGitHub() {
  try {
    const remoteHandles = await GitHubSync.fetchRemoteBlocklist();
    if (Array.isArray(remoteHandles)) {
      chrome.storage.local.set({
        blockedHandles: remoteHandles,
        lastSyncTime: new Date().toISOString()
      });
      console.log(`[BotShield] Mirrored ${remoteHandles.length} handles from GitHub cloud.`);
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

// Also sync on browser launch
chrome.runtime.onStartup.addListener(() => {
  syncFromGitHub();
});
