# seed_whitelist.py - Expands and maintains the trusted whitelist
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

async def expand_whitelist(api: API, limit_per_seed=-1):
    wl = load_whitelist()
    good_seeds = wl.get("goodSeeds", ["abhijeet_dipke", "sauravdassss"])
    existing_handles = set(h.lower().strip() for h in wl.get("handles", []))
    protected_prominent = set(h.lower().strip() for h in wl.get("protectedProminent", []))
    
    print("\n" + "=" * 60)
    print("  SEED WHITELIST: EXPANDING TRUSTED SHIELD NETWORK")
    print("=" * 60)
    print(f"Good Seeds: {good_seeds}")
    print(f"Limit per seed: {'ALL' if limit_per_seed == -1 else limit_per_seed}")
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
            
            print(f"  [+] User resolved: @{user.username} (ID: {user.id}, Total Following: {user.friendsCount})")
            print(f"  -> Streaming followed accounts...")
            
            await asyncio.sleep(1.5)
            
            added_this_seed = 0
            streamed_total = 0
            
            async for u in api.following(user.id, limit=limit_per_seed):
                streamed_total += 1
                handle = u.username.lower().strip()
                if handle not in existing_handles:
                    existing_handles.add(handle)
                    added_this_seed += 1
                
                if streamed_total % 100 == 0:
                    print(f"     -> Processed {streamed_total}/{user.friendsCount} accounts (+{added_this_seed} new to shield)...")
            
            total_new += added_this_seed
            print(f"  [+] Finished @{seed_clean}: streamed {streamed_total} accounts (+{added_this_seed} new to shield)")
            
            # Incremental save after each seed
            sorted_handles = sorted(list(existing_handles))
            payload = {
                "version": "1.0.0",
                "goodSeeds": good_seeds,
                "protectedProminent": list(protected_prominent),
                "totalProtectedCount": len(sorted_handles),
                "handles": sorted_handles
            }
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(EXPANDED_WHITELIST_FILE, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            with open(EXT_WHITELIST_FILE, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            with open(WHITELIST_FILE, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
                
            print(f"  [Saved] Updated whitelist: {len(sorted_handles)} total protected handles.")

            if idx < len(good_seeds):
                print("  [Cooldown] Waiting 3 seconds before next seed...")
                await asyncio.sleep(3.0)

        except Exception as e:
            print(f"  [!] Error processing @{seed_clean}: {e}")

    print("\n" + "=" * 60)
    print("  SEED WHITELIST COMPLETE!")
    print(f"  Total Protected Accounts: {len(existing_handles)} (+{total_new} new)")
    print("=" * 60 + "\n")

async def main():
    api = API()
    accounts = await api.pool.accounts_info()
    if not accounts:
        print("\n[!] No active Twitter session accounts found. Run: twscrape add_cookie ...\n")
        sys.exit(1)
        
    await expand_whitelist(api, limit_per_seed=-1)

if __name__ == "__main__":
    asyncio.run(main())
