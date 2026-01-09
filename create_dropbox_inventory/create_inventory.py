#!/usr/bin/env python3
"""
Dropbox Inventory - Hybrid Script (FIXED)
==========================================
Properly continues from the old recursive script's cursor.

The old script used recursive=True with pagination. When interrupted,
it saved a cursor. This script loads that cursor and continues.

Author: Franz Chandi / TBS DataHub Migration Project
"""

import json
import csv
import time
import logging
import signal
import sys
from datetime import datetime
from pathlib import Path
from collections import deque
import dropbox
from dropbox.files import FileMetadata, FolderMetadata
from dropbox.exceptions import RateLimitError, InternalServerError, ApiError

# ============== CONFIGURATION ==============
ACCESS_TOKEN = "YOUR_ACCESS_TOKEN_HERE"

# Where previous recursive script saved progress
OLD_OUTPUT_DIR = Path("inventory_output")
OLD_INVENTORY_JSON = OLD_OUTPUT_DIR / "inventory.json"
OLD_CHECKPOINT = OLD_OUTPUT_DIR / "checkpoint.json"

# This script's output
OUTPUT_DIR = Path("inventory_output_hybrid")
CHECKPOINT_FILE = OUTPUT_DIR / "checkpoint.json"
INVENTORY_JSON = OUTPUT_DIR / "inventory.json"
INVENTORY_CSV = OUTPUT_DIR / "inventory.csv"
LOG_FILE = OUTPUT_DIR / "inventory.log"

SAVE_INTERVAL_SECONDS = 30
PROGRESS_BAR_WIDTH = 40

# ============================================


def format_size(bytes_val):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} PB"


def progress_bar(current, total, width=40):
    if total == 0:
        return "[" + "?" * width + "] ?/?"
    pct = min(current / total, 1.0)
    filled = int(width * pct)
    bar = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {pct*100:.1f}%"


class HybridInventory:
    def __init__(self, access_token):
        self.dbx = dropbox.Dropbox(access_token, timeout=120)
        
        # Data
        self.entries = []
        self.entries_by_path = {}
        
        # Recursive continuation
        self.cursor = None
        self.has_more = True
        
        # Progress
        self.api_calls = 0
        self.start_time = None
        self.last_save_time = None
        self.is_running = True
        
        # For progress estimation
        self.initial_entries = 0
        self.estimated_total = 400000  # Will update based on rate
        
        # Setup
        OUTPUT_DIR.mkdir(exist_ok=True)
        self._setup_logging()
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _setup_logging(self):
        self.logger = logging.getLogger(__name__)
        self.logger.setLevel(logging.INFO)
        self.logger.handlers = []
        fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
        fh.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(message)s'))
        self.logger.addHandler(fh)
    
    def _signal_handler(self, signum, frame):
        print("\n\n⚠️  Interrupted! Saving progress...")
        self.is_running = False
        self._save_all()
        print("✅ Progress saved. Run again to resume.")
        sys.exit(0)
    
    def _api_call(self, func, description="API call"):
        max_retries = 5
        for attempt in range(max_retries):
            try:
                self.api_calls += 1
                self.logger.info(f"API #{self.api_calls}: {description}")
                return func()
            except RateLimitError as e:
                wait = e.backoff if e.backoff else (2 ** attempt)
                print(f"\n⏳ Rate limited, waiting {wait}s...")
                time.sleep(wait)
            except InternalServerError:
                time.sleep(2 ** attempt)
            except ApiError as e:
                self.logger.error(f"API Error: {e}")
                raise
        raise RuntimeError("Max retries exceeded")
    
    def _process_entry(self, entry):
        if isinstance(entry, FileMetadata):
            parts = entry.path_display.split('/')
            return {
                'type': 'file',
                'name': entry.name,
                'path': entry.path_display,
                'path_lower': entry.path_lower,
                'extension': Path(entry.name).suffix.lower() or None,
                'size_bytes': entry.size,
                'size_mb': round(entry.size / 1_048_576, 2),
                'modified': entry.server_modified.isoformat() if entry.server_modified else None,
                'content_hash': entry.content_hash,
                'revision': entry.rev,
                'dropbox_id': entry.id,
                'folder_depth': len(parts) - 1,
                'parent_folder': '/'.join(parts[:-1]) or '/',
            }
        elif isinstance(entry, FolderMetadata):
            parts = entry.path_display.split('/')
            return {
                'type': 'folder',
                'name': entry.name,
                'path': entry.path_display,
                'path_lower': entry.path_lower,
                'extension': None,
                'size_bytes': 0,
                'size_mb': 0,
                'modified': None,
                'content_hash': None,
                'revision': None,
                'dropbox_id': entry.id,
                'folder_depth': len(parts) - 1,
                'parent_folder': '/'.join(parts[:-1]) or '/',
            }
        return None
    
    def _add_entry(self, entry_dict):
        if entry_dict and entry_dict['path'] not in self.entries_by_path:
            self.entries.append(entry_dict)
            self.entries_by_path[entry_dict['path']] = entry_dict
            return True
        return False
    
    def _load_old_progress(self):
        """Load progress from the OLD recursive script."""
        loaded = False
        
        # Load old checkpoint to get cursor
        if OLD_CHECKPOINT.exists():
            print(f"📂 Found old checkpoint: {OLD_CHECKPOINT}")
            try:
                with open(OLD_CHECKPOINT, 'r', encoding='utf-8') as f:
                    old_checkpoint = json.load(f)
                
                self.cursor = old_checkpoint.get('cursor')
                self.has_more = old_checkpoint.get('has_more', True)
                old_api_calls = old_checkpoint.get('api_calls', 0)
                
                print(f"   ✅ Found cursor: {'Yes' if self.cursor else 'No'}")
                print(f"   ✅ Has more data: {self.has_more}")
                print(f"   ✅ Previous API calls: {old_api_calls}")
                
                loaded = True
            except Exception as e:
                print(f"   ⚠️ Error loading checkpoint: {e}")
        
        # Load old inventory data
        if OLD_INVENTORY_JSON.exists():
            print(f"📂 Found old inventory: {OLD_INVENTORY_JSON}")
            try:
                with open(OLD_INVENTORY_JSON, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                old_entries = data.get('entries', [])
                for entry in old_entries:
                    self._add_entry(entry)
                
                print(f"   ✅ Loaded {len(self.entries):,} entries")
                loaded = True
            except Exception as e:
                print(f"   ⚠️ Error loading inventory: {e}")
        
        # Also check OUR OWN checkpoint (if resuming hybrid)
        if CHECKPOINT_FILE.exists():
            print(f"📂 Found hybrid checkpoint: {CHECKPOINT_FILE}")
            try:
                with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                    checkpoint = json.load(f)
                
                # Our checkpoint takes priority
                self.cursor = checkpoint.get('cursor')
                self.has_more = checkpoint.get('has_more', True)
                self.api_calls = checkpoint.get('api_calls', 0)
                
                # Load our inventory
                if INVENTORY_JSON.exists():
                    with open(INVENTORY_JSON, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.entries = []
                    self.entries_by_path = {}
                    for entry in data.get('entries', []):
                        self._add_entry(entry)
                    print(f"   ✅ Loaded {len(self.entries):,} entries from hybrid inventory")
                
                print(f"   ✅ Cursor: {'Yes' if self.cursor else 'No'}")
                print(f"   ✅ Has more: {self.has_more}")
                loaded = True
            except Exception as e:
                print(f"   ⚠️ Error: {e}")
        
        return loaded
    
    def _save_all(self):
        """Save checkpoint and inventory."""
        # Checkpoint
        checkpoint = {
            'timestamp': datetime.now().isoformat(),
            'cursor': self.cursor,
            'has_more': self.has_more,
            'api_calls': self.api_calls,
            'entries_count': len(self.entries),
        }
        with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
            json.dump(checkpoint, f)
        
        # Inventory
        files_only = [e for e in self.entries if e['type'] == 'file']
        total_size = sum(e['size_bytes'] for e in files_only)
        
        ext_counts = {}
        for e in files_only:
            ext = e.get('extension', '(none)') or '(none)'
            ext_counts[ext] = ext_counts.get(ext, 0) + 1
        
        summary = {
            'generated': datetime.now().isoformat(),
            'status': 'complete' if not self.has_more else 'in_progress',
            'total_entries': len(self.entries),
            'total_files': len(files_only),
            'total_folders': len(self.entries) - len(files_only),
            'total_size_bytes': total_size,
            'total_size_gb': round(total_size / 1_073_741_824, 2),
            'api_calls': self.api_calls,
            'file_types': ext_counts,
        }
        
        with open(INVENTORY_JSON, 'w', encoding='utf-8') as f:
            json.dump({'summary': summary, 'entries': self.entries}, f, indent=2, ensure_ascii=False)
        
        if self.entries:
            fieldnames = ['type', 'name', 'path', 'extension', 'size_bytes',
                          'size_mb', 'modified', 'content_hash', 'parent_folder', 'folder_depth']
            with open(INVENTORY_CSV, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()
                writer.writerows(self.entries)
        
        self.last_save_time = time.time()
        self.logger.info(f"Saved: {len(self.entries):,} entries")
    
    def _print_status(self):
        """Print progress status."""
        elapsed = time.time() - self.start_time
        files = sum(1 for e in self.entries if e['type'] == 'file')
        folders = len(self.entries) - files
        total_size = sum(e['size_bytes'] for e in self.entries if e['type'] == 'file')
        
        # Estimate progress based on size (2.9 TB total expected)
        expected_size = 2.9 * 1024**4  # 2.9 TB in bytes
        size_progress = min(total_size / expected_size, 0.99)
        
        # Clear previous lines
        sys.stdout.write('\033[2K\033[A' * 4 + '\r')
        
        # Progress bar based on estimated size
        bar = progress_bar(total_size, expected_size, PROGRESS_BAR_WIDTH)
        print(f"📊 Progress (by size): {bar} of ~2.9 TB")
        
        # Stats
        new_entries = len(self.entries) - self.initial_entries
        rate = new_entries / elapsed if elapsed > 0 else 0
        print(f"📁 {files:,} files | {folders:,} folders | {format_size(total_size)}")
        print(f"🔄 +{new_entries:,} new entries | {rate:.0f}/sec | API: {self.api_calls}")
        print(f"⏳ Elapsed: {elapsed/60:.1f} min | {'🟢 Running' if self.has_more else '✅ Complete'}")
        
        sys.stdout.flush()
    
    def _continue_recursive(self):
        """Continue recursive scan from cursor."""
        print("\n" + "="*60)
        print("📡 Continuing recursive scan from saved cursor...")
        print("="*60 + "\n")
        
        print("\n\n\n\n")  # Space for status
        
        while self.has_more and self.is_running:
            try:
                result = self._api_call(
                    lambda c=self.cursor: self.dbx.files_list_folder_continue(c),
                    "list_folder_continue"
                )
                
                new_count = 0
                for entry in result.entries:
                    processed = self._process_entry(entry)
                    if self._add_entry(processed):
                        new_count += 1
                
                self.cursor = result.cursor
                self.has_more = result.has_more
                
                self._print_status()
                
                # Save periodically
                if time.time() - self.last_save_time >= SAVE_INTERVAL_SECONDS:
                    self._save_all()
                
            except Exception as e:
                self.logger.error(f"Error in recursive continue: {e}")
                print(f"\n❌ Error: {e}")
                break
    
    def _start_fresh(self):
        """Start a fresh recursive scan."""
        print("\n" + "="*60)
        print("🚀 Starting fresh recursive scan...")
        print("="*60 + "\n")
        
        result = self._api_call(
            lambda: self.dbx.files_list_folder(
                "",
                recursive=True,
                include_mounted_folders=True,
                include_non_downloadable_files=True,
                limit=2000
            ),
            "list_folder (recursive)"
        )
        
        for entry in result.entries:
            processed = self._process_entry(entry)
            self._add_entry(processed)
        
        self.cursor = result.cursor
        self.has_more = result.has_more
        
        print(f"📊 Initial batch: {len(self.entries):,} entries")
        print("\n\n\n\n")
        
        # Continue pagination
        self._continue_recursive()
    
    def run(self):
        """Main execution."""
        self.start_time = time.time()
        self.last_save_time = time.time()
        
        print("""
╔═══════════════════════════════════════════════════════════════════╗
║       TBS Dropbox Inventory - Hybrid Explorer (FIXED)             ║
╠═══════════════════════════════════════════════════════════════════╣
║  • Loads previous progress from old script                        ║
║  • Continues from saved cursor (doesn't re-scan!)                 ║
║  • Press Ctrl+C anytime to save and pause                         ║
╚═══════════════════════════════════════════════════════════════════╝
        """)
        
        # Load previous progress
        had_progress = self._load_old_progress()
        self.initial_entries = len(self.entries)
        
        print(f"\n📊 Starting with {len(self.entries):,} entries")
        
        if self.cursor and self.has_more:
            # Continue from cursor
            print(f"🔄 Cursor found - will continue where old script left off")
            self._continue_recursive()
        elif not self.has_more and self.entries:
            # Already complete!
            print(f"\n✅ Inventory is already complete!")
        else:
            # No cursor, need fresh start
            print(f"⚠️ No cursor found - starting fresh recursive scan")
            self._start_fresh()
        
        # Final save
        if self.is_running:
            self._save_all()
            
            if not self.has_more:
                # Clean up checkpoint
                if CHECKPOINT_FILE.exists():
                    CHECKPOINT_FILE.unlink()
            
            elapsed = time.time() - self.start_time
            files = sum(1 for e in self.entries if e['type'] == 'file')
            total_size = sum(e['size_bytes'] for e in self.entries if e['type'] == 'file')
            
            print("\n\n" + "="*60)
            if self.has_more:
                print("⏸️  PAUSED - Run again to continue")
            else:
                print("✅ INVENTORY COMPLETE!")
            print(f"   Files: {files:,}")
            print(f"   Folders: {len(self.entries) - files:,}")
            print(f"   Total size: {format_size(total_size)}")
            print(f"   API calls this session: {self.api_calls}")
            print(f"   Time this session: {elapsed/60:.1f} minutes")
            print(f"\n   📄 {INVENTORY_JSON}")
            print(f"   📄 {INVENTORY_CSV}")
            print("="*60)


def main():
    if ACCESS_TOKEN == "YOUR_ACCESS_TOKEN_HERE":
        print("❌ ERROR: Paste your access token in the script (line 24)")
        sys.exit(1)
    
    inventory = HybridInventory(ACCESS_TOKEN)
    inventory.run()


if __name__ == "__main__":
    main()