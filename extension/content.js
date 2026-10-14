// BotShield for X (Twitter) - Content Script
(() => {
  let config = {
    enabled: true,
    mode: 'collapse', // 'collapse' | 'hide'
    blockedHandles: new Set()
  };

  let sessionBlockedCount = 0;

  // Clean a handle string (e.g. "@username", "/username", "username" -> "username")
  function cleanHandle(raw) {
    if (!raw) return null;
    let handle = raw.trim().toLowerCase();
    // Strip leading @
    if (handle.startsWith('@')) handle = handle.slice(1);
    // Strip leading slash if from href
    if (handle.startsWith('/')) handle = handle.slice(1);
    // Strip query parameters or subpaths (e.g., username/status/123)
    handle = handle.split('/')[0].split('?')[0];
    // Filter out common twitter navigation paths
    const reserved = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings'];
    if (reserved.includes(handle)) return null;
    return handle.trim();
  }

  // Extract author handle from a tweet article DOM element
  function getTweetAuthor(tweetElem) {
    // 1. Check author avatar anchor link (most reliable author identification on Twitter/X)
    const avatarLink = tweetElem.querySelector('div[data-testid="Tweet-User-Avatar"] a[href^="/"]');
    if (avatarLink) {
      const handle = cleanHandle(avatarLink.getAttribute('href'));
      if (handle) return handle;
    }

    // 2. Check User-Name container
    const userNameContainer = tweetElem.querySelector('div[data-testid="User-Name"]');
    if (userNameContainer) {
      const links = userNameContainer.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const text = link.textContent || '';
        if (text.includes('@')) {
          const match = text.match(/@([a-zA-Z0-9_]+)/);
          if (match && match[1]) return match[1].toLowerCase();
        }
        const h = cleanHandle(link.getAttribute('href'));
        if (h) return h;
      }
    }

    return null;
  }

  // Apply blocking (hide or collapse) to a tweet element
  function applyBlockAction(tweetElem, authorHandle) {
    const isBlocked = config.enabled && config.blockedHandles.has(authorHandle);
    const existingBanner = tweetElem.querySelector('.botshield-collapsed-banner');
    const cellInner = tweetElem.closest('div[data-testid="cellInnerDiv"]') || tweetElem;

    if (isBlocked) {
      if (config.mode === 'hide') {
        // Full hide mode
        if (existingBanner) existingBanner.remove();
        cellInner.classList.add('botshield-hidden-completely');
        tweetElem.classList.remove('botshield-has-banner');
      } else {
        // Collapse mode (Show discreet banner with reveal option)
        cellInner.classList.remove('botshield-hidden-completely');

        if (!existingBanner) {
          const banner = document.createElement('div');
          banner.className = 'botshield-collapsed-banner';
          banner.innerHTML = `
            <div class="botshield-banner-info">
              <span class="botshield-banner-badge">🛡️ Bot Shield</span>
              <span>Tweet from <span class="botshield-banner-handle">@${authorHandle}</span> filtered</span>
            </div>
            <button type="button" class="botshield-banner-toggle-btn">Show Tweet</button>
          `;

          // Get the main content container inside tweet to toggle
          const tweetContentWrapper = tweetElem.firstElementChild;
          if (tweetContentWrapper) {
            tweetContentWrapper.classList.add('botshield-tweet-content-collapsed');
          }

          const toggleBtn = banner.querySelector('.botshield-banner-toggle-btn');
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const isCollapsed = tweetContentWrapper?.classList.contains('botshield-tweet-content-collapsed');
            if (isCollapsed) {
              tweetContentWrapper?.classList.remove('botshield-tweet-content-collapsed');
              toggleBtn.textContent = 'Hide Tweet';
            } else {
              tweetContentWrapper?.classList.add('botshield-tweet-content-collapsed');
              toggleBtn.textContent = 'Show Tweet';
            }
          });

          tweetElem.prepend(banner);
          tweetElem.classList.add('botshield-has-banner');
        }
      }

      if (!tweetElem.dataset.botshieldCounted) {
        tweetElem.dataset.botshieldCounted = 'true';
        sessionBlockedCount++;
        chrome.storage.local.set({ sessionBlockedCount });
      }
    } else {
      // Restore if previously blocked
      cellInner.classList.remove('botshield-hidden-completely');
      if (existingBanner) existingBanner.remove();
      const tweetContentWrapper = tweetElem.firstElementChild;
      if (tweetContentWrapper) {
        tweetContentWrapper.classList.remove('botshield-tweet-content-collapsed');
      }
      tweetElem.classList.remove('botshield-has-banner');
    }
  }

  // Process all tweets currently on page
  function processTweets() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    for (const tweet of tweets) {
      const author = getTweetAuthor(tweet);
      if (author) {
        tweet.dataset.botshieldAuthor = author;
        applyBlockAction(tweet, author);
      }
    }
  }

  // Debounced scan using requestAnimationFrame
  let scheduled = false;
  function scheduleScan() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        processTweets();
        scheduled = false;
      });
    }
  }

  // Load configuration and initialize
  function init() {
    chrome.storage.local.get(['enabled', 'mode', 'blockedHandles', 'sessionBlockedCount'], (res) => {
      if (typeof res.enabled === 'boolean') config.enabled = res.enabled;
      if (res.mode) config.mode = res.mode;
      if (Array.isArray(res.blockedHandles)) {
        config.blockedHandles = new Set(res.blockedHandles.map(h => cleanHandle(h)).filter(Boolean));
      } else {
        config.blockedHandles = new Set();
        chrome.storage.local.set({ blockedHandles: [] });
      }

      if (typeof res.sessionBlockedCount === 'number') {
        sessionBlockedCount = res.sessionBlockedCount;
      }

      // Initial scan
      processTweets();

      // Observe dynamic changes in timeline
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            scheduleScan();
            break;
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  // Listen for real-time updates from popup without needing a reload
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.enabled) {
      config.enabled = changes.enabled.newValue;
    }
    if (changes.mode) {
      config.mode = changes.mode.newValue;
    }
    if (changes.blockedHandles) {
      const handles = changes.blockedHandles.newValue || [];
      config.blockedHandles = new Set(handles.map(h => cleanHandle(h)).filter(Boolean));
    }

    // Re-evaluate all tweets with the updated config
    processTweets();
  });

  // Start extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
