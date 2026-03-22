# ============================================================
# ChurnLens — Phase 2: Push Predictions to Supabase (v2)
# ============================================================
# pip install supabase pandas python-dotenv
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
BATCH_SIZE   = 200    # smaller = less likely to timeout
MAX_RETRIES  = 5      # retry on SSL/network errors
RETRY_DELAY  = 3      # seconds to wait before retrying

# ── Connect ──────────────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("✅ Connected to Supabase")

# ── Load predictions ─────────────────────────────────────────
df = pd.read_csv(PREDICTIONS)
print(f"Loaded {len(df):,} rows from {PREDICTIONS}")
print(f"Risk tier breakdown:\n{df['risk_tier'].value_counts()}\n")

# ── Helpers ──────────────────────────────────────────────────
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
    """Upsert a batch with exponential backoff retry on network errors."""
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

# ── Derived column ────────────────────────────────────────────
df['avg_order_value'] = (
    df['total_revenue'] / df['total_orders'].replace(0, 1)
).round(2)

# ── Build customers rows ──────────────────────────────────────
print("Building customers payload...")
customers_data = []
for _, row in df.iterrows():
    customers_data.append({
        "user_id":              int(safe_val(row['user_id'])),
        "age_bucket":           safe_val(row['age_bucket']),
        "gender":               safe_val(row['gender']),
        "traffic_source":       safe_val(row['traffic_source']),
        "total_orders":         int(safe_val(row['total_orders'])),
        "total_revenue":        float(round(safe_val(row['total_revenue']), 2)),
        "avg_order_value":      float(round(safe_val(row['avg_order_value']), 2)),
        "orders_per_month":     float(round(safe_val(row['orders_per_month']), 3)),
        "customer_tenure_days": int(safe_val(row['customer_tenure_days'])),
        "return_rate":          float(round(safe_val(row['return_rate']), 3)),
        "one_time_buyer":       bool(safe_val(row['one_time_buyer'])),
        "rfm_frequency_score":  int(safe_val(row['rfm_frequency_score'])),
        "rfm_monetary_score":   int(safe_val(row['rfm_monetary_score'])),
    })

# ── Upload customers ──────────────────────────────────────────
print(f"Uploading {len(customers_data):,} customers in batches of {BATCH_SIZE}...")
batches = list(chunked(customers_data, BATCH_SIZE))
total_batches = len(batches)
uploaded = 0
failed_batches = []

for i, batch in enumerate(batches, 1):
    success = upsert_with_retry("customers", batch, "user_id", i, total_batches)
    if success:
        uploaded += len(batch)
        if i % 10 == 0 or i == total_batches:
            print(f"  → {uploaded:,} / {len(customers_data):,} uploaded")
    else:
        failed_batches.append(("customers", i, batch))

if failed_batches:
    print(f"\n⚠️  {len(failed_batches)} batch(es) failed permanently — see above.")
else:
    print(f"✅ customers table: {uploaded:,} rows\n")

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

# ── Upload risk_scores ────────────────────────────────────────
print(f"Uploading {len(scores_data):,} risk scores in batches of {BATCH_SIZE}...")
batches = list(chunked(scores_data, BATCH_SIZE))
total_batches = len(batches)
uploaded = 0

for i, batch in enumerate(batches, 1):
    success = upsert_with_retry("risk_scores", batch, "user_id", i, total_batches)
    if success:
        uploaded += len(batch)
        if i % 10 == 0 or i == total_batches:
            print(f"  → {uploaded:,} / {len(scores_data):,} uploaded")
    else:
        failed_batches.append(("risk_scores", i, batch))

if failed_batches:
    print(f"\n⚠️  {len(failed_batches)} batch(es) failed permanently.")
else:
    print(f"✅ risk_scores table: {uploaded:,} rows\n")

# ── Verify ────────────────────────────────────────────────────
print("── Verification ────────────────────────────────────────")
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
except Exception as e:
    print(f"Verification query failed: {e}")
    print("(Data may still have uploaded correctly — check Supabase Table Editor)")

print("\n✅ Phase 2 complete!")
print("\nNext steps:")
print("  1. Tableau → Connect to PostgreSQL → Supabase connection string")
print("  2. Primary source: vw_customer_risk")
print("  3. Overview source: vw_segment_summary")