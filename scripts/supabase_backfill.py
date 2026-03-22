# ============================================================
# ChurnLens — Backfill Missing risk_scores Rows
# ============================================================
# Finds ALL user_ids in customers but missing from risk_scores
# then uploads them from churn_predictions.csv
# ============================================================

import os
import time
from pathlib import Path
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
PREDICTIONS  = Path(__file__).resolve().parent.parent / "data" / "churn_predictions.csv"
BATCH_SIZE   = 200
MAX_RETRIES  = 5
RETRY_DELAY  = 3

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("✅ Connected to Supabase")

# ── Step 1: Get ALL customer user_ids from Supabase ──────────
print("\nFetching all customer user_ids from Supabase...")
all_customer_ids = set()
page = 0
page_size = 1000

while True:
    result = (
        supabase.table("customers")
        .select("user_id")
        .range(page * page_size, (page + 1) * page_size - 1)
        .execute()
    )
    batch = result.data
    if not batch:
        break
    for row in batch:
        all_customer_ids.add(row['user_id'])
    page += 1
    if len(batch) < page_size:
        break

print(f"Total customers in Supabase: {len(all_customer_ids):,}")

# ── Step 2: Get ALL existing risk_score user_ids ─────────────
print("Fetching existing risk_score user_ids from Supabase...")
existing_score_ids = set()
page = 0

while True:
    result = (
        supabase.table("risk_scores")
        .select("user_id")
        .range(page * page_size, (page + 1) * page_size - 1)
        .execute()
    )
    batch = result.data
    if not batch:
        break
    for row in batch:
        existing_score_ids.add(row['user_id'])
    page += 1
    if len(batch) < page_size:
        break

print(f"Existing risk scores in Supabase: {len(existing_score_ids):,}")

# ── Step 3: Find missing IDs ──────────────────────────────────
missing_ids = all_customer_ids - existing_score_ids
print(f"\nMissing risk scores: {len(missing_ids):,} rows to backfill")

if not missing_ids:
    print("✅ No missing rows — database is complete!")
    exit()

# ── Step 4: Load predictions CSV and filter to missing ────────
print(f"\nLoading {PREDICTIONS}...")
df = pd.read_csv(PREDICTIONS)
df['user_id'] = df['user_id'].astype(int)

missing_df = df[df['user_id'].isin(missing_ids)].copy()
print(f"Found {len(missing_df):,} matching rows in CSV to upload")

# ── Helpers ───────────────────────────────────────────────────
def chunked(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]

def safe_val(v):
    if pd.isna(v):
        return None
    if hasattr(v, 'item'):
        return v.item()
    return v

def upsert_with_retry(table, batch, on_conflict, batch_num, total_batches):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            supabase.table(table).upsert(batch, on_conflict=on_conflict).execute()
            return True
        except Exception as e:
            err = str(e)
            if attempt < MAX_RETRIES:
                wait = RETRY_DELAY * attempt
                print(f"  ⚠️  Batch {batch_num}/{total_batches} failed (attempt {attempt}): {err[:80]}")
                print(f"     Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ❌ Batch {batch_num}/{total_batches} failed after {MAX_RETRIES} attempts.")
                return False
    return False

# ── Step 5: Build and upload missing scores ───────────────────
print("\nBuilding risk_scores payload...")
scores_data = []
for _, row in missing_df.iterrows():
    scores_data.append({
        "user_id":           int(safe_val(row['user_id'])),
        "churn_probability": float(round(safe_val(row['churn_probability']), 4)),
        "risk_tier":         safe_val(row['risk_tier']),
        "actual_churned":    bool(safe_val(row['actual_churned'])),
        "top_feature_1":     safe_val(row['top_feature_1']),
        "top_feature_2":     safe_val(row['top_feature_2']),
        "top_feature_3":     safe_val(row['top_feature_3']),
    })

print(f"Uploading {len(scores_data):,} missing rows in batches of {BATCH_SIZE}...")
batches = list(chunked(scores_data, BATCH_SIZE))
total_batches = len(batches)
uploaded = 0
failed = []

for i, batch in enumerate(batches, 1):
    success = upsert_with_retry("risk_scores", batch, "user_id", i, total_batches)
    if success:
        uploaded += len(batch)
        if i % 5 == 0 or i == total_batches:
            print(f"  → {uploaded:,} / {len(scores_data):,} uploaded")
    else:
        failed.append(i)

print(f"\n✅ Backfill complete: {uploaded:,} rows uploaded")
if failed:
    print(f"⚠️  {len(failed)} batches still failed: {failed}")

# ── Step 6: Verify final count ────────────────────────────────
print("\n── Final verification ──────────────────────────────────")
result = supabase.table("risk_scores").select("risk_tier", count="exact").execute()
print(f"Total risk_scores rows: {result.count:,}")

result2 = (
    supabase.table("risk_scores")
    .select("risk_tier")
    .execute()
)
verify_df = pd.DataFrame(result2.data)
if not verify_df.empty:
    print(verify_df['risk_tier'].value_counts().to_string())
print("\n✅ Done — Supabase is now complete!")
