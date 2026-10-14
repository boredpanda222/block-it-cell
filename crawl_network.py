# crawl_network.py - Automated network expansion and whitelist guardrail
import asyncio
import json
import os
import sys
from twscrape import API, gather

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
WHITELIST_FILE = os.path.join(os.path.dirname(__file__), "whitelist.json")
LOCAL_BLOCKLIST_FILE = os.path.join(DATA_DIR, "blocklist.local.json")
EXPANDED_WHITELIST_FILE = os.path.join(DATA_DIR, "whitelist.expanded.local.json")
CANDIDATES_FILE = os.path.join(DATA_DIR, "candidates.local.json")

def load_whitelist():
    if os.path.exists(WHITELIST_FILE):
        with open(WHITELIST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"goodSeeds": [], "protectedProminent": [], "handles": []}

def load_blocklist():
    if os.path.exists(LOCAL_BLOCKLIST_FILE):
        with open(LOCAL_BLOCKLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("handles", [])
    return []

async def expand_good_whitelist(api: API, limit_per_seed=200):
    """
    Crawls who our trusted 'good' journalists/opposition figures are following.
    Because credible journalists follow other credible reporters and civil society,
    this automatically constructs a robust shield list.
    """
    wl = load_whitelist()
    good_seeds = wl.get("goodSeeds", [])
    existing_handles = set(h.lower().strip() for h in wl.get("handles", []))
    protected_prominent = set(h.lower().strip() for h in wl.get("protectedProminent", []))
    
    print(f"\n[Whitelist Expansion] Processing {len(good_seeds)} good seeds...")
    
    for seed in good_seeds:
        seed_clean = seed.lower().strip().lstrip("@")
        print(f" -> Fetching accounts followed by @{seed_clean} (limit={limit_per_seed})...")
        try:
            user = await api.user_by_login(seed_clean)
            if not user:
                print(f"    [!] Could not resolve user @{seed_clean}")
                continue
            
            # Fetch who they follow
            following_list = await gather(api.following(user.id, limit=limit_per_seed))
            added_count = 0
            for u in following_list:
                handle = u.username.lower().strip()
                if handle not in existing_handles:
                    existing_handles.add(handle)
                    added_count += 1
            print(f"    ✓ Found {len(following_list)} followed accounts (+{added_count} newly whitelisted)")
        except Exception as e:
            print(f"    [!] Error crawling @{seed_clean}: {e}")
            
    # Save expanded whitelist
    updated_wl = {
        "version": "1.0.0",
        "goodSeeds": good_seeds,
        "protectedProminent": list(protected_prominent),
        "totalProtectedCount": len(existing_handles),
        "handles": sorted(list(existing_handles))
    }
    
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(EXPANDED_WHITELIST_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_wl, f, indent=2)
        
    print(f"\n[Whitelist Ready] Total protected handles: {len(existing_handles)}")
    print(f"Saved to: {EXPANDED_WHITELIST_FILE}")
    return existing_handles

async def expand_bad_blocklist(api: API, whitelist_set: set, limit_per_seed=200):
    """
    Crawls followers and following of core troll hubs (excluding any VIP politicians).
    Cross-checks against whitelist: anything matching whitelist is strictly skipped.
    """
    current_blocks = set(load_blocklist())
    # Exclude prominent VIPs like Modi from follower crawling as instructed
    wl = load_whitelist()
    ignored_vips = set(h.lower().strip().lstrip("@") for h in wl.get("protectedProminent", []))
    
    # Specific troll hubs to crawl
    troll_seeds = [h for h in current_blocks if h.lower() not in ignored_vips]
    print(f"\n[Blocklist Expansion] Crawling network of {len(troll_seeds)} troll hubs...")
    print(f"Ignored Prominent Handles (Not crawled): {list(ignored_vips)}")
    
    new_candidates = set()
    
    for seed in troll_seeds:
        seed_clean = seed.lower().strip().lstrip("@")
        print(f" -> Analyzing @{seed_clean} (limit={limit_per_seed})...")
        try:
            user = await api.user_by_login(seed_clean)
            if not user:
                print(f"    [!] Could not resolve user @{seed_clean}")
                continue
                
            # Fetch following (the accounts this troll actively follows)
            following = await gather(api.following(user.id, limit=limit_per_seed))
            for u in following:
                handle = u.username.lower().strip()
                # Hard Whitelist Check: strictly immune
                if handle in whitelist_set or handle in ignored_vips:
                    continue
                if handle not in current_blocks:
                    new_candidates.add(handle)
                    
            print(f"    ✓ Processed following list: {len(following)} accounts")
        except Exception as e:
            print(f"    [!] Error crawling @{seed_clean}: {e}")
            
    print(f"\n[Candidate Pool] Found {len(new_candidates)} new candidate handles.")
    candidate_payload = {
        "count": len(new_candidates),
        "sourceTrollSeeds": troll_seeds,
        "candidates": sorted(list(new_candidates))
    }
    
    with open(CANDIDATES_FILE, "w", encoding="utf-8") as f:
        json.dump(candidate_payload, f, indent=2)
        
    print(f"Saved candidate list to: {CANDIDATES_FILE}")
    return new_candidates

async def main():
    api = API()
    
    # Check if accounts are logged in
    accounts = await api.pool.accounts_info()
    if not accounts:
        print("\n=======================================================")
        print("  twscrape needs at least 1 account session to query Twitter.")
        print("=======================================================")
        print("Quick Setup (Zero passwords needed):")
        print("1. In your browser (logged into X/Twitter), open DevTools (F12) -> Application -> Cookies -> https://x.com")
        print("2. Copy the 'auth_token' and 'ct0' values.")
        print("3. Run in terminal:")
        print("   twscrape add_cookie myaccount \"auth_token=YOUR_TOKEN; ct0=YOUR_CT0\"")
        print("=======================================================\n")
        sys.exit(1)
        
    print(f"[Init] Found {len(accounts)} Twitter session account(s) ready.")
    
    # Step 1: Build expanded whitelist first (The Universal Shield)
    whitelist_set = await expand_good_whitelist(api, limit_per_seed=150)
    
    # Step 2: Ingest the troll network while checking against whitelist
    await expand_bad_blocklist(api, whitelist_set, limit_per_seed=150)

if __name__ == "__main__":
    asyncio.run(main())
