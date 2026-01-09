#!/usr/bin/env python3
"""
Robust Dropbox Inventory Script for TBS Data Migration
Features:
- Incremental saving (every 60 seconds or 1000 entries)
- Resume capability from checkpoint
- Detailed logging with API call tracking
- Progress display
- Graceful interruption handling (Ctrl+C saves progress)

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
import dropbox
from dropbox.files import FileMetadata, FolderMetadata
from dropbox.exceptions import RateLimitError, InternalServerError, ApiError

# ============== CONFIGURATION ==============
ACCESS_TOKEN = "sl.u.AGO8_JKPA3njP9sMEQkkKJkqlpO4E3TbaBt1fqbmrcN1grgdC60ibZnC2UPskvH_z5zZJG8n2GTAmNSVqtnXtJxNRzWLpngB0IBlr7iRqPKWzxejTbHGAKDYOy62mZ95s0MiVEf4K6lblGv6tqKt_9fxze0tTvXfvS1rS0aZVp8lgoY0TPnxaKW4XVrBvH6aF-hdt-R4FnTMTf4SjyD7MlSiiazyRA5g9FCcewgrkYatzSzCNso03-ofWK9dAztx62jyEI-ebxag0w-9zxYa8YK8yQew7CZKcEqtilrR_XceLtIUbZpgIDcrgtKrx7ODYcxCPHIFgvY7BhwOW7fuubLF1wntdEfcqcr4NDCbovCmxvQW74wS3bSPbjiq4nABtvPstFqY76wj363WOo3Pdo89zChFeZ6pKLXggcmb89DAT49629Rheo3rY0k57Sx6Myu20Sesr_QgMD_S3yifHYISsivvis99aGd0od91v9ZcXQONVXY9BxtAJURp6P0n9tjnvOCJGwKQUgFtUuKIDkVszhx05ICjg6a-hsSsglPYiazbOZpldpLJYAaCLOMJo9tnJZ-T72nX9NcpChQtyWg-_u4CRMfnItZd58rzxOGB7LC9XRxbnKslfJzkc5BbAH4NRRwiUMVTpGHd21Hu1M8nSBoAvlxftRlkfMnAvDT10MOY2Rd2AUoPx6InivYgH5EPWPxbVXzwYghs8-dnrhkKMkoKTzCh6faMCbVq6xK-tNA4AfHCScm1BiNAY9ukXP3RQ0rjpbnC_NfL82vOrfcOmc8HAVFXoLT8jNAf9PRof3bEhM60qQRcfX7M5aCp1o6fUOgXcUciLI78ofUG1cb3ynEbpeln5PlV68oSr01fv3XoyaFfp0groG-pjmlDLJD6flhGnwcTz6dQpIC8tMoOPigvU67CNrO_M5dT3HlDhnEYozewmKoiN538caJIDGNX6l6YJ1o8yukE_nIfuqUdO_FjG7CIcTCAcTDQheBYKuCeIOoNUKc_Ws380XJ0JBMWBeGHMj6DxnoKDbD9TKKQ45wk6jZT9yDbm-kzYPhNHc-pdmbfd2wfHEnZdciWaCHNswpVW2nPJGC_k6ZPBu57hpCxCG-Hz2o-GpJXUN-nTeo3ALnSudfuQjIwi_ij3JMtFWRJMTT-XlICryaQKkoZfhNtNLYaJ_cnqmIq4VDPB0X2MOJxjN8J2ybZSRbQfyfZs8YinTaPrU4VAeyEfTMd1FXlzci2bGTxx4iYHUDKUymss-t3R-AxiNwPKLgZVy1SbWuyjdF_BkXxYXXQ7nRiFnqzcPFUD7g0mdHQyXE517lOzGEeI-5CgERk5tgivGAxZBMIku5p4dWE_1CqxtMm"

# Output settings
OUTPUT_DIR = Path("inventory_output")
CHECKPOINT_FILE = OUTPUT_DIR / "checkpoint.json"
INVENTORY_JSON = OUTPUT_DIR / "inventory.json"
INVENTORY_CSV = OUTPUT_DIR / "inventory.csv"
LOG_FILE = OUTPUT_DIR / "inventory.log"

# Save frequency
SAVE_INTERVAL_SECONDS = 60  # Save every 60 seconds
SAVE_INTERVAL_ENTRIES = 1000  # Or every 1000 new entries

# ============================================


class DropboxInventory:
    def __init__(self, access_token):
        self.dbx = dropbox.Dropbox(access_token, timeout=120)
        self.entries = []
        self.folders_seen = set()
        self.api_calls = 0
        self.start_time = None
        self.last_save_time = None
        self.entries_since_save = 0
        self.cursor = None
        self.has_more = True
        self.is_running = True
        
        # Setup output directory
        OUTPUT_DIR.mkdir(exist_ok=True)
        
        # Setup logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s | %(levelname)s | %(message)s',
            handlers=[
                logging.FileHandler(LOG_FILE, encoding='utf-8'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
        
        # Handle Ctrl+C gracefully
        signal.signal(signal.SIGINT, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle Ctrl+C - save progress before exiting."""
        self.logger.warning("\n⚠️  Interrupted! Saving progress before exit...")
        self.is_running = False
        self._save_checkpoint()
        self._save_inventory()
        self.logger.info("✅ Progress saved. You can resume later.")
        sys.exit(0)
    
    def _api_call(self, func, description="API call"):
        """Execute API call with retry logic and counting."""
        max_retries = 5
        for attempt in range(max_retries):
            try:
                self.api_calls += 1
                result = func()
                return result
            except RateLimitError as e:
                wait = e.backoff if e.backoff else (2 ** attempt)
                self.logger.warning(f"Rate limited. Waiting {wait}s... (attempt {attempt+1})")
                time.sleep(wait)
            except InternalServerError as e:
                wait = 2 ** attempt
                self.logger.warning(f"Server error. Waiting {wait}s... (attempt {attempt+1})")
                time.sleep(wait)
            except ApiError as e:
                self.logger.error(f"API Error in {description}: {e}")
                raise
        raise RuntimeError(f"Max retries exceeded for {description}")
    
    def _save_checkpoint(self):
        """Save current state for resume capability."""
        checkpoint = {
            'cursor': self.cursor,
            'has_more': self.has_more,
            'entries_count': len(self.entries),
            'api_calls': self.api_calls,
            'timestamp': datetime.now().isoformat(),
            'folders_seen': list(self.folders_seen)
        }
        with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
            json.dump(checkpoint, f, indent=2)
        self.logger.debug(f"Checkpoint saved: {len(self.entries)} entries")
    
    def _load_checkpoint(self):
        """Load previous state if exists."""
        if CHECKPOINT_FILE.exists():
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                checkpoint = json.load(f)
            
            # Load existing inventory if available
            if INVENTORY_JSON.exists():
                with open(INVENTORY_JSON, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.entries = data.get('entries', [])
            
            self.cursor = checkpoint.get('cursor')
            self.has_more = checkpoint.get('has_more', True)
            self.api_calls = checkpoint.get('api_calls', 0)
            self.folders_seen = set(checkpoint.get('folders_seen', []))
            
            self.logger.info(f"📂 Resumed from checkpoint: {len(self.entries)} entries, {self.api_calls} API calls")
            return True
        return False
    
    def _save_inventory(self):
        """Save current inventory to JSON and CSV."""
        # Calculate summary
        files_only = [e for e in self.entries if e['type'] == 'file']
        total_size = sum(e['size_bytes'] for e in files_only)
        
        # Count by extension
        ext_counts = {}
        ext_sizes = {}
        for entry in files_only:
            ext = entry.get('extension', '(none)') or '(none)'
            ext_counts[ext] = ext_counts.get(ext, 0) + 1
            ext_sizes[ext] = ext_sizes.get(ext, 0) + entry['size_bytes']
        
        summary = {
            'generated': datetime.now().isoformat(),
            'status': 'complete' if not self.has_more else 'in_progress',
            'total_entries': len(self.entries),
            'total_files': len(files_only),
            'total_folders': len(self.entries) - len(files_only),
            'total_size_bytes': total_size,
            'total_size_gb': round(total_size / 1_073_741_824, 2),
            'api_calls_made': self.api_calls,
            'file_types': ext_counts,
            'size_by_type_gb': {k: round(v / 1_073_741_824, 3) for k, v in ext_sizes.items()}
        }
        
        # Save JSON
        with open(INVENTORY_JSON, 'w', encoding='utf-8') as f:
            json.dump({
                'summary': summary,
                'entries': self.entries
            }, f, indent=2, ensure_ascii=False)
        
        # Save CSV (utf-8-sig for Excel)
        if self.entries:
            fieldnames = ['type', 'name', 'path', 'extension', 'size_bytes', 
                          'size_mb', 'modified', 'content_hash', 'parent_folder', 'folder_depth']
            with open(INVENTORY_CSV, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                writer.writeheader()
                writer.writerows(self.entries)
        
        self.last_save_time = time.time()
        self.entries_since_save = 0
        self.logger.info(f"💾 Saved: {len(self.entries)} entries, {summary['total_size_gb']:.2f} GB")
    
    def _process_entry(self, entry):
        """Convert Dropbox entry to inventory dict."""
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
            self.folders_seen.add(entry.path_lower)
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
    
    def _should_save(self):
        """Check if we should save progress."""
        if self.last_save_time is None:
            return False
        time_elapsed = time.time() - self.last_save_time
        return (time_elapsed >= SAVE_INTERVAL_SECONDS or 
                self.entries_since_save >= SAVE_INTERVAL_ENTRIES)
    
    def _print_progress(self):
        """Print current progress stats."""
        elapsed = time.time() - self.start_time
        files = sum(1 for e in self.entries if e['type'] == 'file')
        folders = len(self.entries) - files
        rate = len(self.entries) / elapsed if elapsed > 0 else 0
        
        self.logger.info(
            f"📊 Progress: {files:,} files, {folders:,} folders | "
            f"API calls: {self.api_calls} | "
            f"Rate: {rate:.0f} entries/sec | "
            f"Elapsed: {elapsed/60:.1f} min"
        )
    
    def run(self, resume=True):
        """Run the inventory process."""
        self.start_time = time.time()
        self.last_save_time = time.time()
        
        # Try to resume from checkpoint
        if resume and self._load_checkpoint() and self.cursor:
            self.logger.info("▶️  Continuing from previous run...")
        else:
            # Fresh start
            self.logger.info("🚀 Starting fresh inventory...")
            self.entries = []
            self.cursor = None
            self.has_more = True
            self.api_calls = 0
            
            # Initial listing
            result = self._api_call(
                lambda: self.dbx.files_list_folder(
                    "",
                    recursive=True,
                    include_mounted_folders=True,
                    include_non_downloadable_files=True,
                    limit=2000
                ),
                "Initial list_folder"
            )
            
            for entry in result.entries:
                processed = self._process_entry(entry)
                if processed:
                    self.entries.append(processed)
                    self.entries_since_save += 1
            
            self.cursor = result.cursor
            self.has_more = result.has_more
            self._print_progress()
        
        # Continue pagination
        while self.has_more and self.is_running:
            result = self._api_call(
                lambda c=self.cursor: self.dbx.files_list_folder_continue(c),
                "list_folder_continue"
            )
            
            for entry in result.entries:
                processed = self._process_entry(entry)
                if processed:
                    self.entries.append(processed)
                    self.entries_since_save += 1
            
            self.cursor = result.cursor
            self.has_more = result.has_more
            
            # Progress update every API call
            self._print_progress()
            
            # Save checkpoint periodically
            if self._should_save():
                self._save_checkpoint()
                self._save_inventory()
        
        # Final save
        if self.is_running:
            self.has_more = False
            self._save_checkpoint()
            self._save_inventory()
            
            # Clean up checkpoint file on successful completion
            if CHECKPOINT_FILE.exists():
                CHECKPOINT_FILE.unlink()
            
            elapsed = time.time() - self.start_time
            self.logger.info("=" * 60)
            self.logger.info("✅ INVENTORY COMPLETE!")
            self.logger.info(f"   Total entries: {len(self.entries):,}")
            self.logger.info(f"   API calls: {self.api_calls}")
            self.logger.info(f"   Time elapsed: {elapsed/60:.1f} minutes")
            self.logger.info(f"   Output: {INVENTORY_JSON}")
            self.logger.info(f"   Output: {INVENTORY_CSV}")
            self.logger.info("=" * 60)


def main():
    # Validate token
    if ACCESS_TOKEN == "YOUR_ACCESS_TOKEN_HERE":
        print("❌ ERROR: Please paste your access token in the script!")
        print("   Edit the ACCESS_TOKEN variable at the top of the file.")
        sys.exit(1)
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║     TBS Dropbox Inventory Script - DataHub Migration         ║
╠══════════════════════════════════════════════════════════════╣
║  • Progress saved every 60 sec or 1000 entries               ║
║  • Press Ctrl+C to pause (progress will be saved)            ║
║  • Run again to resume from where you left off               ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    # Ask about resume
    if CHECKPOINT_FILE.exists():
        response = input("📂 Previous progress found. Resume? (y/n): ").strip().lower()
        resume = response == 'y'
    else:
        resume = False
    
    inventory = DropboxInventory(ACCESS_TOKEN)
    inventory.run(resume=resume)


if __name__ == "__main__":
    main()