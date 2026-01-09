#!/usr/bin/env python3
"""
Dropbox Inventory Verification Script
======================================
Verifies that the inventory captured everything by:
1. Listing top-level folders from API and comparing to inventory
2. Spot-checking a few folder sizes
3. Comparing total with Dropbox account info

Author: Franz Chandi / TBS DataHub Migration Project
"""

import json
from pathlib import Path
import dropbox
from dropbox.files import FileMetadata, FolderMetadata

# ============== CONFIGURATION ==============
ACCESS_TOKEN = "sl.u.AGO8_JKPA3njP9sMEQkkKJkqlpO4E3TbaBt1fqbmrcN1grgdC60ibZnC2UPskvH_z5zZJG8n2GTAmNSVqtnXtJxNRzWLpngB0IBlr7iRqPKWzxejTbHGAKDYOy62mZ95s0MiVEf4K6lblGv6tqKt_9fxze0tTvXfvS1rS0aZVp8lgoY0TPnxaKW4XVrBvH6aF-hdt-R4FnTMTf4SjyD7MlSiiazyRA5g9FCcewgrkYatzSzCNso03-ofWK9dAztx62jyEI-ebxag0w-9zxYa8YK8yQew7CZKcEqtilrR_XceLtIUbZpgIDcrgtKrx7ODYcxCPHIFgvY7BhwOW7fuubLF1wntdEfcqcr4NDCbovCmxvQW74wS3bSPbjiq4nABtvPstFqY76wj363WOo3Pdo89zChFeZ6pKLXggcmb89DAT49629Rheo3rY0k57Sx6Myu20Sesr_QgMD_S3yifHYISsivvis99aGd0od91v9ZcXQONVXY9BxtAJURp6P0n9tjnvOCJGwKQUgFtUuKIDkVszhx05ICjg6a-hsSsglPYiazbOZpldpLJYAaCLOMJo9tnJZ-T72nX9NcpChQtyWg-_u4CRMfnItZd58rzxOGB7LC9XRxbnKslfJzkc5BbAH4NRRwiUMVTpGHd21Hu1M8nSBoAvlxftRlkfMnAvDT10MOY2Rd2AUoPx6InivYgH5EPWPxbVXzwYghs8-dnrhkKMkoKTzCh6faMCbVq6xK-tNA4AfHCScm1BiNAY9ukXP3RQ0rjpbnC_NfL82vOrfcOmc8HAVFXoLT8jNAf9PRof3bEhM60qQRcfX7M5aCp1o6fUOgXcUciLI78ofUG1cb3ynEbpeln5PlV68oSr01fv3XoyaFfp0groG-pjmlDLJD6flhGnwcTz6dQpIC8tMoOPigvU67CNrO_M5dT3HlDhnEYozewmKoiN538caJIDGNX6l6YJ1o8yukE_nIfuqUdO_FjG7CIcTCAcTDQheBYKuCeIOoNUKc_Ws380XJ0JBMWBeGHMj6DxnoKDbD9TKKQ45wk6jZT9yDbm-kzYPhNHc-pdmbfd2wfHEnZdciWaCHNswpVW2nPJGC_k6ZPBu57hpCxCG-Hz2o-GpJXUN-nTeo3ALnSudfuQjIwi_ij3JMtFWRJMTT-XlICryaQKkoZfhNtNLYaJ_cnqmIq4VDPB0X2MOJxjN8J2ybZSRbQfyfZs8YinTaPrU4VAeyEfTMd1FXlzci2bGTxx4iYHUDKUymss-t3R-AxiNwPKLgZVy1SbWuyjdF_BkXxYXXQ7nRiFnqzcPFUD7g0mdHQyXE517lOzGEeI-5CgERk5tgivGAxZBMIku5p4dWE_1CqxtMm"

INVENTORY_JSON = Path("inventory_output_hybrid/inventory.json")
# ============================================


def format_size(bytes_val):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024:
            return f"{bytes_val:.2f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.2f} PB"


def load_inventory():
    """Load the inventory JSON."""
    with open(INVENTORY_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data


def get_inventory_folders_at_depth(entries, depth):
    """Get all folders at a specific depth from inventory."""
    return [e for e in entries if e['type'] == 'folder' and e['folder_depth'] == depth]


def get_inventory_size_for_path(entries, path):
    """Calculate total size of files under a given path."""
    total = 0
    for e in entries:
        if e['type'] == 'file' and e['path'].startswith(path):
            total += e['size_bytes']
    return total


def main():
    print("""
╔═══════════════════════════════════════════════════════════════════╗
║       Dropbox Inventory Verification                              ║
╚═══════════════════════════════════════════════════════════════════╝
    """)
    
    # Load inventory
    print("📂 Loading inventory...")
    data = load_inventory()
    entries = data['entries']
    summary = data['summary']
    
    print(f"   Inventory has: {summary['total_files']:,} files, {summary['total_folders']:,} folders")
    print(f"   Inventory size: {format_size(summary['total_size_bytes'])}")
    print()
    
    # Connect to Dropbox
    print("🔗 Connecting to Dropbox API...")
    dbx = dropbox.Dropbox(ACCESS_TOKEN, timeout=60)
    
    # Get account info
    print("\n" + "="*60)
    print("1. ACCOUNT SPACE USAGE")
    print("="*60)
    
    try:
        space = dbx.users_get_space_usage()
        used = space.used
        print(f"   Dropbox reports: {format_size(used)} used")
        print(f"   Inventory shows: {format_size(summary['total_size_bytes'])}")
        
        diff = used - summary['total_size_bytes']
        diff_pct = (diff / used) * 100 if used > 0 else 0
        
        if abs(diff_pct) < 5:
            print(f"   ✅ Match! Difference: {format_size(abs(diff))} ({abs(diff_pct):.1f}%)")
        else:
            print(f"   ⚠️  Difference: {format_size(diff)} ({diff_pct:.1f}%)")
    except Exception as e:
        print(f"   ⚠️  Could not get space usage: {e}")
    
    # List root folders from API
    print("\n" + "="*60)
    print("2. TOP-LEVEL FOLDERS COMPARISON")
    print("="*60)
    
    print("\n   Fetching root folders from Dropbox API...")
    result = dbx.files_list_folder("", recursive=False)
    api_root_folders = []
    api_root_files = []
    
    for entry in result.entries:
        if isinstance(entry, FolderMetadata):
            api_root_folders.append(entry.path_display)
        elif isinstance(entry, FileMetadata):
            api_root_files.append(entry.path_display)
    
    # Handle pagination
    while result.has_more:
        result = dbx.files_list_folder_continue(result.cursor)
        for entry in result.entries:
            if isinstance(entry, FolderMetadata):
                api_root_folders.append(entry.path_display)
            elif isinstance(entry, FileMetadata):
                api_root_files.append(entry.path_display)
    
    print(f"   API root folders: {len(api_root_folders)}")
    print(f"   API root files: {len(api_root_files)}")
    
    # Get inventory root folders (depth 1)
    inv_root_folders = get_inventory_folders_at_depth(entries, 1)
    inv_root_paths = [e['path'] for e in inv_root_folders]
    
    print(f"   Inventory root folders: {len(inv_root_folders)}")
    
    # Compare
    api_set = set(api_root_folders)
    inv_set = set(inv_root_paths)
    
    missing_in_inventory = api_set - inv_set
    extra_in_inventory = inv_set - api_set
    
    if not missing_in_inventory:
        print(f"\n   ✅ All root folders are in inventory!")
    else:
        print(f"\n   ❌ Missing from inventory:")
        for f in missing_in_inventory:
            print(f"      - {f}")
    
    if extra_in_inventory:
        print(f"\n   ⚠️  Extra in inventory (deleted?):")
        for f in extra_in_inventory:
            print(f"      - {f}")
    
    # List all root folders with sizes
    print("\n   Root folder sizes from inventory:")
    for folder in sorted(inv_root_folders, key=lambda x: x['path']):
        size = get_inventory_size_for_path(entries, folder['path'])
        file_count = sum(1 for e in entries if e['type'] == 'file' and e['path'].startswith(folder['path']))
        print(f"      {folder['name']:<40} {format_size(size):>12} ({file_count:,} files)")
    
    # Spot check a few folders
    print("\n" + "="*60)
    print("3. SPOT CHECK - RANDOM FOLDER VERIFICATION")
    print("="*60)
    
    # Pick a few folders to verify
    folders_to_check = []
    
    # Get some level-2 folders
    level2_folders = get_inventory_folders_at_depth(entries, 2)
    if level2_folders:
        # Pick first 3
        folders_to_check.extend([f['path'] for f in level2_folders[:3]])
    
    print(f"\n   Checking {len(folders_to_check)} folders against API...")
    
    for folder_path in folders_to_check:
        try:
            # Get from API
            api_result = dbx.files_list_folder(folder_path, recursive=False)
            api_count = len(api_result.entries)
            while api_result.has_more:
                api_result = dbx.files_list_folder_continue(api_result.cursor)
                api_count += len(api_result.entries)
            
            # Get from inventory
            inv_count = sum(1 for e in entries if e['parent_folder'] == folder_path)
            
            match = "✅" if api_count == inv_count else "⚠️"
            print(f"   {match} {folder_path}")
            print(f"      API: {api_count} items | Inventory: {inv_count} items")
            
        except Exception as e:
            print(f"   ❌ {folder_path}: {e}")
    
    # Summary by depth
    print("\n" + "="*60)
    print("4. ENTRIES BY FOLDER DEPTH")
    print("="*60)
    
    depth_counts = {}
    for e in entries:
        d = e['folder_depth']
        if d not in depth_counts:
            depth_counts[d] = {'files': 0, 'folders': 0}
        if e['type'] == 'file':
            depth_counts[d]['files'] += 1
        else:
            depth_counts[d]['folders'] += 1
    
    print("\n   Depth | Folders | Files")
    print("   ------|---------|--------")
    for depth in sorted(depth_counts.keys()):
        counts = depth_counts[depth]
        print(f"   {depth:>5} | {counts['folders']:>7,} | {counts['files']:>10,}")
    
    # Final verdict
    print("\n" + "="*60)
    print("5. VERIFICATION SUMMARY")
    print("="*60)
    
    issues = []
    if missing_in_inventory:
        issues.append(f"Missing {len(missing_in_inventory)} root folders")
    
    if issues:
        print("\n   ⚠️  ISSUES FOUND:")
        for issue in issues:
            print(f"      - {issue}")
    else:
        print("\n   ✅ INVENTORY APPEARS COMPLETE!")
        print(f"      - All root folders present")
        print(f"      - Size matches Dropbox account ({format_size(summary['total_size_bytes'])})")
        print(f"      - {summary['total_files']:,} files across {summary['total_folders']:,} folders")
    
    print("\n" + "="*60)


if __name__ == "__main__":
    if ACCESS_TOKEN == "YOUR_ACCESS_TOKEN_HERE":
        print("❌ ERROR: Paste your access token in the script")
    else:
        main()
