# BotShield for Twitter / X

A lightweight browser extension designed to detect, collapse, or completely hide tweets and replies from bot networks, troll farms, and propaganda accounts on Twitter/X (`x.com` and `twitter.com`).

---

## 🚀 How to Install in Your Browser (Chrome / Brave / Edge)

1. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **"Load unpacked"**.
4. Select the folder:
   ```
   c:\projects\bots\extension
   ```
5. You will see **"BotShield for X (Twitter)"** installed! Pin it to your extensions bar.

---

## ⚙️ Features & Usage

- **Live Dynamic Filter**: Uses high-performance `MutationObserver` to intercept tweets instantly as you scroll through threads or your feed.
- **Two Filtering Modes**:
  - **Collapse Mode (Default)**: Replaces the bot tweet with an alert bar:
    `[ 🛡️ Bot Shield: Tweet from @handle filtered | Show Tweet ]`
    Clicking "Show Tweet" reveals the tweet if you wish to inspect it.
  - **Full Hide Mode**: Completely removes the tweet and its divider (`display: none`), leaving zero trace on your timeline.
- **Instant Live Updates**: Adding or removing an account in the popup updates open Twitter tabs in real time without refreshing!
- **Batch Edit**: Easily paste or export large lists of handles at once.
- **Session Stats Counter**: Shows how many bot tweets were intercepted during your session.

---

## 🛠️ GitHub Master DB & Auto-Sync

BotShield can maintain a synchronized master list on GitHub for all your users.

### 1. For You (Maintainer Mode)
1. Open [`extension/config.local.json`](file:///c:/projects/bots/extension/config.local.json).
2. Enter your details:
   ```json
   {
     "githubOwner": "your-github-username",
     "githubRepo": "your-repo-name",
     "githubBranch": "main",
     "githubPath": "blocklist.json",
     "githubToken": "github_pat_xxxxxxxxxxxxxxxxxxxx"
   }
   ```
3. Whenever you add a handle in the extension popup, BotShield:
   - Immediately commits the update directly to your GitHub repository.
   - Updates your local blocklist and active Twitter tabs.
4. **Security**: `config.local.json` is in `.gitignore` so your personal access token is never uploaded or tracked.

### 2. For End Users (Distributed Public Mode)
1. Edit [`extension/config.json`](file:///c:/projects/bots/extension/config.json) to point to your public repository.
2. When regular users install the extension:
   - They need **no token or login**.
   - The extension auto-syncs the master blocklist from your public GitHub CDN in the background every 6 hours.
   - Users can click **"⟳ Sync DB"** anytime in the popup for an on-demand update.
