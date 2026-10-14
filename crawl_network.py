# crawl_network.py - Stage 1: Whitelist Builder & Shield Generator
import asyncio
import json
import os
import sys

# Ensure UTF-8 output on Windows consoles
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from twscrape import API, gather

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
WHITELIST_FILE = os.path.join(os.path.dirname(__file__), "whitelist.json")
EXT_WHITELIST_FILE = os.path.join(os.path.dirname(__file__), "extension", "whitelist.json")
EXPANDED_WHITELIST_FILE = os.path.join(DATA_DIR, "whitelist.expanded.local.json")

def load_whitelist():
    if os.path.exists(WHITELIST_FILE):
        with open(WHITELIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "goodSeeds": ["abhijeet_dipke", "sauravdassss"],
        "protectedProminent": ["narendramodi"],
        "handles": ["abhijeet_dipke", "sauravdassss", "narendramodi"]
    }

async def expand_good_whitelist(api: API, limit_per_seed=60):
    """
    Crawls accounts followed by trusted journalists/voices.
    Operates gently with delays between calls to keep the session 100% safe.
    """
    wl = load_whitelist()
    good_seeds = wl.get("goodSeeds", ["abhijeet_dipke", "sauravdassss"])
    existing_handles = set(h.lower().strip() for h in wl.get("handles", []))
    protected_prominent = set(h.lower().strip() for h in wl.get("protectedProminent", []))
    
    print("\n" + "=" * 60)
    print("  BOTSHIELD: STAGE 1 - EXPANDING TRUSTED WHITELIST")
    print("=" * 60)
    print(f"Good Seeds to Crawl: {good_seeds}")
    print(f"Per-seed limit: {limit_per_seed} (Safe, low-velocity rate)")
    print("-" * 60)
    
    total_new = 0

    for idx, seed in enumerate(good_seeds, 1):
        seed_clean = seed.lower().strip().lstrip("@")
        print(f"\n[{idx}/{len(good_seeds)}] Fetching profile for @{seed_clean}...")
        
        try:
            user = await api.user_by_login(seed_clean)
            if not user:
                print(f"  [!] Could not find user @{seed_clean}")
                continue
            
            print(f"  [+] User resolved: @{user.username} (ID: {user.id}, Following: {user.friendsCount})")
            print(f"  -> Pulling up to {limit_per_seed} followed accounts...")
            
            # Gentle delay to simulate natural browser reading
            await asyncio.sleep(2.0)
            
            # Fetch who they follow
            following_list = await gather(api.following(user.id, limit=limit_per_seed))
            
            added_this_seed = 0
            for u in following_list:
                handle = u.username.lower().strip()
                if handle not in existing_handles:
                    existing_handles.add(handle)
                    added_this_seed += 1
            
            total_new += added_this_seed
            print(f"  [+] Successfully fetched {len(following_list)} accounts (+{added_this_seed} newly added to shield)")
            
            # Safe pause before next seed
            if idx < len(good_seeds):
                print("  [Cooldown] Waiting 3 seconds before next seed...")
                await asyncio.sleep(3.0)

        except Exception as e:
            print(f"  [!] Error processing @{seed_clean}: {e}")

    # Build final whitelist payload
    sorted_handles = sorted(list(existing_handles))
    updated_wl = {
        "version": "1.0.0",
        "updatedAt": "2026-10-14",
        "description": "Protected authentic voices, journalists, and opposition handles that can NEVER be blocked.",
        "goodSeeds": good_seeds,
        "protectedProminent": list(protected_prominent),
        "totalProtectedCount": len(sorted_handles),
        "handles": sorted_handles
    }
    
    # Save to local data folder (gitignored)
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(EXPANDED_WHITELIST_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_wl, f, indent=2)
        
    # Update active extension whitelist so browser extension protects them immediately
    with open(EXT_WHITELIST_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_wl, f, indent=2)

    with open(WHITELIST_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_wl, f, indent=2)

    print("\n" + "=" * 60)
    print("  WHITELIST EXPANSION COMPLETE!")
    print(f"  Total Protected Accounts: {len(sorted_handles)} (+{total_new} new)")
    print(f"  Saved to: {EXPANDED_WHITELIST_FILE}")
    print(f"  Updated extension guardrail: {EXT_WHITELIST_FILE}")
    print("=" * 60 + "\n")
    return sorted_handles

async def main():
    api = API()
    
    # Check if accounts are logged in
    accounts = await api.pool.accounts_info()
    if not accounts:
        print("\n=======================================================")
        print("  twscrape needs your browser cookie session to run.")
        print("=======================================================")
        print("1. In your browser (logged into X), press F12 -> Application -> Cookies -> https://x.com")
        print("2. Copy 'auth_token' and 'ct0'")
        print("3. Run in terminal:")
        print("   twscrape add_cookie myaccount \"auth_token=...; ct0=...\"")
        print("=======================================================\n")
        sys.exit(1)
        
    print(f"[Ready] Found {len(accounts)} session account in twscrape.")
    
    # Run only Stage 1: Whitelist Builder
    await expand_good_whitelist(api, limit_per_seed=60)

if __name__ == "__main__":
    asyncio.run(main())
