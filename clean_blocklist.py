# clean_blocklist.py - Cleans and sanitizes the master blocklist
import json
import os
import re
import sys

# Ensure UTF-8 output on Windows consoles
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
WHITELIST_FILE = os.path.join(os.path.dirname(__file__), "whitelist.json")
EXPANDED_WHITELIST_FILE = os.path.join(DATA_DIR, "whitelist.expanded.local.json")
LOCAL_BLOCKLIST_FILE = os.path.join(DATA_DIR, "blocklist.local.json")

# Known institutional patterns, international bodies, and major news wires that should never be blocked
KNOWN_EXEMPTIONS = {
    # International & UN bodies
    "un", "unccd", "who", "unesco", "unicef", "worldbank", "imfnews",
    # Global media / news wires
    "reuters", "afp", "ap", "bbcbreaking", "bbcworld", "ani", "pti_news",
    # Global sports / entertainment
    "theweeknd", "ballondor", "barcacentre", "fifaworldcup", "icc",
    # Indian state & official bodies
    "delhipolice", "mumbaipolice", "uppolice", "cmomaharashtra", "pmoindia"
}

def load_all_whitelist():
    """Loads all protected handles from base and expanded whitelist"""
    protected = set(KNOWN_EXEMPTIONS)
    for fpath in [WHITELIST_FILE, EXPANDED_WHITELIST_FILE]:
        if os.path.exists(fpath):
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                for h in data.get("handles", []):
                    protected.add(h.lower().strip().lstrip("@"))
                for h in data.get("protectedProminent", []):
                    protected.add(h.lower().strip().lstrip("@"))
    return protected

def is_institutional(handle):
    h = handle.lower()
    if h in KNOWN_EXEMPTIONS:
        return True
    # Matches handles like *police, cmo*, pmo*
    if re.search(r'(police|traffic|cmo|pmo|gov|judiciary)$', h):
        return True
    return False

def clean_blocklist():
    if not os.path.exists(LOCAL_BLOCKLIST_FILE):
        print(f"[!] No local blocklist file found at {LOCAL_BLOCKLIST_FILE}")
        return

    with open(LOCAL_BLOCKLIST_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    raw_handles = data.get("handles", [])
    whitelist_set = load_all_whitelist()

    print("\n" + "=" * 60)
    print("  BOTSHIELD: BLOCKLIST SANITIZER & CLEANER")
    print("=" * 60)
    print(f"Current Blocklist Total: {len(raw_handles)}")
    print(f"Protected Whitelist Shield: {len(whitelist_set)} accounts")
    print("-" * 60)

    removed_whitelisted = []
    removed_institutional = []
    cleaned_handles = []

    for h in raw_handles:
        handle_clean = h.lower().strip().lstrip("@")
        if not handle_clean:
            continue

        if handle_clean in whitelist_set:
            removed_whitelisted.append(handle_clean)
            continue

        if is_institutional(handle_clean):
            removed_institutional.append(handle_clean)
            continue

        cleaned_handles.append(handle_clean)

    # Deduplicate and sort
    final_handles = sorted(list(set(cleaned_handles)))

    # Save cleaned file
    payload = {
        "version": "1.0.0",
        "updatedAt": "2026-10-14",
        "description": "Curated list of coordinated bot accounts on X / Twitter.",
        "handles": final_handles
    }

    with open(LOCAL_BLOCKLIST_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"\n[Cleaning Results]")
    print(f"  Removed Whitelisted Journalists/Allies ({len(removed_whitelisted)}): {removed_whitelisted[:10]}")
    print(f"  Removed Institutional/Celebrity Handles ({len(removed_institutional)}): {removed_institutional[:10]}")
    print(f"  Final Cleaned Blocklist: {len(final_handles)} accounts")
    print(f"[+] Saved to: {LOCAL_BLOCKLIST_FILE}")
    print("=" * 60)
    print("Run 'node sync-data.js --push' whenever you want to publish these to the cloud.\n")

if __name__ == "__main__":
    clean_blocklist()
