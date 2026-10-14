# seed_blacklist.py - Crawls troll hub networks and builds candidate blocklist
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

from twscrape import API

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
WHITELIST_FILE = os.path.join(os.path.dirname(__file__), "whitelist.json")
EXPANDED_WHITELIST_FILE = os.path.join(DATA_DIR, "whitelist.expanded.local.json")
LOCAL_BLOCKLIST_FILE = os.path.join(DATA_DIR, "blocklist.local.json")
CANDIDATES_FILE = os.path.join(DATA_DIR, "candidates.local.json")

def load_all_protected_whitelist():
    """Loads all protected handles from both base and expanded whitelist"""
    protected = set()
    for fpath in [WHITELIST_FILE, EXPANDED_WHITELIST_FILE]:
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                for h in data.get("handles", []):
                    protected.add(h.lower().strip())
                for h in data.get("protectedProminent", []):
                    protected.add(h.lower().strip())
    return protected

def load_current_blocklist():
    if os.path.exists(LOCAL_BLOCKLIST_FILE):
        with open(LOCAL_BLOCKLIST_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return set(h.lower().strip() for h in data.get("handles", []))
    return set()

async def expand_blacklist(api: API, custom_seeds=None, limit_per_seed=150, auto_merge=False):
    protected_set = load_all_protected_whitelist()
    current_blocklist = load_current_blocklist()
    
    # Seeds to crawl
    if custom_seeds:
        seeds = [s.lower().strip().lstrip("@") for s in custom_seeds]
    else:
        # Default to existing known hubs in blocklist, excluding any VIPs
        seeds = [s for s in current_blocklist if s not in protected_set]
        
    print("\n" + "=" * 60)
    print("  SEED BLACKLIST: EXPANDING TROLL NETWORK CANDIDATES")
    print("=" * 60)
    print(f"Loaded Protected Whitelist Shield: {len(protected_set)} accounts (strictly immune)")
    print(f"Current Blocklist: {len(current_blocklist)} accounts")
    print(f"Troll Seeds to Crawl: {seeds}")
    print(f"Per-seed limit: {limit_per_seed}")
    print("-" * 60)

    new_candidates = set()
    whitelisted_skipped = 0

    for idx, seed in enumerate(seeds, 1):
        print(f"\n[{idx}/{len(seeds)}] Inspecting network of @{seed}...")
        try:
            user = await api.user_by_login(seed)
            if not user:
                print(f"  [!] Could not find user @{seed}")
                continue
                
            print(f"  [+] User resolved: @{user.username} (Following: {user.friendsCount}, Followers: {user.followersCount})")
            print(f"  -> Streaming accounts followed by @{seed}...")
            
            await asyncio.sleep(1.5)
            
            streamed = 0
            added_this_seed = 0
            
            async for u in api.following(user.id, limit=limit_per_seed):
                streamed += 1
                handle = u.username.lower().strip()
                
                # Check 1: Hard Whitelist Guardrail
                if handle in protected_set:
                    whitelisted_skipped += 1
                    continue
                    
                # Check 2: Already in blocklist
                if handle in current_blocklist or handle in new_candidates:
                    continue
                    
                new_candidates.add(handle)
                added_this_seed += 1
                
                if streamed % 50 == 0:
                    print(f"     -> Processed {streamed} accounts (+{added_this_seed} new candidates)...")
                    
            print(f"  [+] Finished @{seed}: streamed {streamed} accounts (+{added_this_seed} candidates, skipped {whitelisted_skipped} whitelisted)")
            
            # Incremental save after each seed
            current_blocklist = current_blocklist.union(new_candidates)
            merged = sorted(list(current_blocklist))
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(LOCAL_BLOCKLIST_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "version": "1.0.0",
                    "updatedAt": "2026-10-14",
                    "description": "Curated list of coordinated bot accounts on X / Twitter.",
                    "handles": merged
                }, f, indent=2)
            print(f"  [Saved] Updated blocklist: {len(merged)} total handles on disk.")

            if idx < len(seeds):
                print("  [Cooldown] Waiting 3 seconds before next seed...")
                await asyncio.sleep(3.0)
                
        except Exception as e:
            print(f"  [!] Error crawling @{seed}: {e}")

    sorted_candidates = sorted(list(new_candidates))
    
    # Directly update blocklist.local.json
    os.makedirs(DATA_DIR, exist_ok=True)
    merged = sorted(list(current_blocklist.union(new_candidates)))
    blocklist_payload = {
        "version": "1.0.0",
        "updatedAt": "2026-10-14",
        "description": "Curated list of coordinated bot accounts on X / Twitter.",
        "handles": merged
    }
    with open(LOCAL_BLOCKLIST_FILE, "w", encoding="utf-8") as f:
        json.dump(blocklist_payload, f, indent=2)

    print("\n" + "=" * 60)
    print("  SEED BLACKLIST INGESTION COMPLETE!")
    print(f"  New Accounts Ingested: {len(sorted_candidates)}")
    print(f"  Whitelisted Accounts Automatically Protected: {whitelisted_skipped}")
    print(f"  Total Blocklist Size: {len(merged)} accounts")
    print(f"✓ Saved directly to: {LOCAL_BLOCKLIST_FILE}")
    print("=" * 60)
    print("Tip: Run 'python clean_blocklist.py' anytime to sanitize before publishing.")
    print("     Run 'node sync-data.js --push' to publish to cloud.\n")

async def main():
    api = API()
    accounts = await api.pool.accounts_info()
    if not accounts:
        print("\n[!] No active Twitter session accounts found. Run: twscrape add_cookie ...\n")
        sys.exit(1)
        
    # Check CLI flags
    auto_merge = "--merge" in sys.argv or "-m" in sys.argv
    limit = -1  # Default to complete network
    for arg in sys.argv:
        if arg.startswith("--limit="):
            try:
                limit = int(arg.split("=")[1])
            except ValueError:
                pass

    # Extract custom seeds if provided: python seed_blacklist.py handle1 handle2
    custom_seeds = [a for a in sys.argv[1:] if not a.startswith("-")]
    
    await expand_blacklist(
        api,
        custom_seeds=custom_seeds if custom_seeds else None,
        limit_per_seed=limit,
        auto_merge=auto_merge
    )

if __name__ == "__main__":
    asyncio.run(main())
