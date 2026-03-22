# ============================================================
# ChurnLens — Phase 2b: Upload risk_scores only
# ============================================================
# Run this AFTER:
#   1. ALTER TABLE risk_scores ADD CONSTRAINT risk_scores_user_id_key UNIQUE (user_id);
#   2. Customers table is already uploaded (80,110 rows)
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

df = pd.read_csv(PREDICTIONS)
print(f"Loaded {len(df):,} rows\n")

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
                print(f"     Error: {err[:120]}")
                return False
    return False

# ── Build risk_scores rows ────────────────────────────────────
print("Building risk_scores payload...")
scores_data = []
for _, row in df.iterrows():
    scores_data.append({
        "user_id":           int(safe_val(row['user_id'])),
        "churn_probability": float(round(safe_val(row['churn_probability']), 4)),
        "risk_tier":         safe_val(row['risk_tier']),
        "actual_churned":    bool(safe_val(row['actual_churned'])),
        "top_feature_1":     safe_val(row['top_feature_1']),
        "top_feature_2":     safe_val(row['top_feature_2']),
        "top_feature_3":     safe_val(row['top_feature_3']),
    })

# ── Upload ────────────────────────────────────────────────────
print(f"Uploading {len(scores_data):,} risk scores in batches of {BATCH_SIZE}...")
batches = list(chunked(scores_data, BATCH_SIZE))
total_batches = len(batches)
uploaded = 0
failed = []

for i, batch in enumerate(batches, 1):
    success = upsert_with_retry("risk_scores", batch, "user_id", i, total_batches)
    if success:
        uploaded += len(batch)
        if i % 20 == 0 or i == total_batches:
            print(f"  → {uploaded:,} / {len(scores_data):,} uploaded")
    else:
        failed.append(i)

if failed:
    print(f"\n⚠️  {len(failed)} batch(es) permanently failed: {failed}")
else:
    print(f"\n✅ risk_scores table: {uploaded:,} rows")

# ── Verify ────────────────────────────────────────────────────
print("\n── Verification ────────────────────────────────────────")
try:
    result = supabase.table("risk_scores").select("risk_tier, churn_probability").execute()
    verify_df = pd.DataFrame(result.data)
    summary = (
        verify_df.groupby('risk_tier')
        .agg(count=('churn_probability', 'count'),
             avg_score=('churn_probability', 'mean'))
        .round(3)
    )
    print(summary)
    print("\n✅ Phase 2 complete! Both tables live in Supabase.")
    print("\nNext → Phase 3: Connect Tableau to Supabase + build dashboard")
except Exception as e:
    print(f"Verification failed: {e}")
    print("Check Supabase Table Editor to confirm rows landed.")
