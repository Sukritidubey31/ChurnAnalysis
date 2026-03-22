import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import roc_auc_score, classification_report, RocCurveDisplay
from xgboost import XGBClassifier
import warnings
from pathlib import Path
warnings.filterwarnings("ignore")

_ROOT        = Path(__file__).resolve().parent.parent
DATA_PATH    = _ROOT / "data" / "churn_features.csv"
OUTPUT_PATH  = _ROOT / "data" / "churn_predictions.csv"
RANDOM_STATE = 42

df = pd.read_csv(DATA_PATH)
print(f"Shape: {df.shape}")
print(f"Churn rate: {df['churned'].mean():.1%}")
print(f"US customers: {df['is_us_customer'].sum():,} ({df['is_us_customer'].mean():.1%})")

df = df[df['total_orders'] >= 1].copy()
print(f"\nAfter scoping to buyers: {df.shape[0]:,} users")
print(f"Churn rate (buyers only): {df['churned'].mean():.1%}")

num_cols = [
    'total_orders', 'total_revenue', 'avg_order_value', 'revenue_per_order',
    'customer_tenure_days', 'orders_per_month', 'return_rate',
    'returned_orders', 'cancelled_orders', 'distinct_categories',
    'total_events', 'cart_events', 'purchase_events', 'approx_sessions',
    'cart_to_purchase_ratio', 'revenue_per_session'
]
for col in num_cols:
    df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

df['cart_to_purchase_ratio'] = df['cart_to_purchase_ratio'].fillna(0)
df['revenue_per_session']    = df['revenue_per_session'].fillna(0)

for col in ['total_revenue', 'total_events', 'approx_sessions', 'customer_tenure_days']:
    cap = df[col].quantile(0.99)
    df[col] = df[col].clip(upper=cap)

print(f"\nMissing values after cleaning:\n{df.isnull().sum()[df.isnull().sum() > 0]}")

df['rfm_frequency_score'] = pd.qcut(
    df['total_orders'].rank(method='first'), q=5, labels=[1,2,3,4,5]
).astype(int)
df['rfm_monetary_score'] = pd.qcut(
    df['total_revenue'].rank(method='first'), q=5, labels=[1,2,3,4,5]
).astype(int)

df['events_per_order'] = df['total_events'] / (df['total_orders'] + 1)
df['high_return_flag'] = (df['return_rate'] > 0.5).astype(int)
df['one_time_buyer']   = (df['total_orders'] == 1).astype(int)
df['cancel_rate']      = df['cancelled_orders'] / (df['total_orders'] + 1)

df['revenue_per_day']  = df['total_revenue'] / (df['customer_tenure_days'] + 1)

print("\nEngineered: rfm_frequency_score, rfm_monetary_score, events_per_order,")
print("  high_return_flag, one_time_buyer, cancel_rate, revenue_per_day")

LEAKAGE_COLS = [
    'days_since_last_order', 'rfm_recency_score', 'rfm_total',
    'purchase_events', 'total_events', 'approx_sessions',
    'revenue_per_session', 'cart_to_purchase_ratio',
]
META_COLS = ['user_id', 'city', 'state', 'top_category', 'is_us_customer', 'churned']
drop_cols  = LEAKAGE_COLS + META_COLS

feature_cols = [c for c in df.columns if c not in drop_cols]
print(f"\nFinal feature set ({len(feature_cols)} features): {feature_cols}")

df_temp = df[feature_cols].copy()
for col in df_temp.select_dtypes(include='object').columns:
    df_temp[col] = LabelEncoder().fit_transform(df_temp[col].astype(str))

corr = df_temp.join(df['churned']).corr()['churned'].abs().sort_values(ascending=False)
print("\n── Leak detector: feature correlation with churn (top 10) ──")
print(corr.drop('churned').head(10).round(3).to_string())

high_corr = corr.drop('churned')[corr.drop('churned') > 0.6]
if len(high_corr):
    print(f"\n⚠️  High-correlation features (>0.6): {list(high_corr.index)}")
    print("   → Consider dropping these before finalizing the model")
else:
    print("\n✅ No features with correlation > 0.6 — clean feature set")

fig, axes = plt.subplots(2, 3, figsize=(16, 10))
fig.suptitle("ChurnLens — TheLook EDA (Buyers Only)", fontsize=16, fontweight="bold")

age_order = ['18-24','25-34','35-44','45-54','55+']
churn_age = df.groupby('age_bucket')['churned'].mean().reindex(age_order)
axes[0,0].bar(churn_age.index, churn_age.values, color='#e74c3c', alpha=0.8)
axes[0,0].set_title("Churn Rate by Age Bucket")
axes[0,0].set_ylabel("Churn Rate")
axes[0,0].tick_params(axis='x', rotation=20)

churn_gender = df.groupby('gender')['churned'].mean()
axes[0,1].bar(churn_gender.index, churn_gender.values,
              color=['#3498db','#e91e8c'][:len(churn_gender)], alpha=0.8)
axes[0,1].set_title("Churn Rate by Gender")

axes[0,2].hist(df[df['churned']==0]['orders_per_month'].clip(upper=5),
               bins=30, alpha=0.6, label='Retained', color='#2ecc71')
axes[0,2].hist(df[df['churned']==1]['orders_per_month'].clip(upper=5),
               bins=30, alpha=0.6, label='Churned', color='#e74c3c')
axes[0,2].set_title("Orders per Month")
axes[0,2].legend()

churn_traffic = df.groupby('traffic_source')['churned'].mean().sort_values()
axes[1,0].barh(churn_traffic.index, churn_traffic.values, color='#9b59b6', alpha=0.8)
axes[1,0].set_title("Churn Rate by Traffic Source")

churn_otb = df.groupby('one_time_buyer')['churned'].mean()
axes[1,1].bar(['Repeat buyer','One-time buyer'], churn_otb.values,
              color=['#2ecc71','#e74c3c'], alpha=0.8)
axes[1,1].set_title("Churn: One-time vs Repeat Buyers")
axes[1,1].set_ylabel("Churn Rate")

axes[1,2].hist(df[df['churned']==0]['total_revenue'].clip(upper=1500),
               bins=40, alpha=0.6, label='Retained', color='#2ecc71')
axes[1,2].hist(df[df['churned']==1]['total_revenue'].clip(upper=1500),
               bins=40, alpha=0.6, label='Churned', color='#e74c3c')
axes[1,2].set_title("Total Revenue: Churned vs Retained")
axes[1,2].legend()

plt.tight_layout()
plt.savefig(_ROOT / "visualizations" / "eda_thelook.png", dpi=150)
print("\nEDA saved: visualizations/eda_thelook.png")

if 'state' in df.columns:
    us_df = df[df['is_us_customer'] == True]
    churn_state = (us_df.groupby('state')['churned']
                   .agg(['mean','count'])
                   .query('count >= 30')
                   .sort_values('mean', ascending=False)
                   .head(15))
    if not churn_state.empty:
        plt.figure(figsize=(10, 6))
        plt.barh(churn_state.index, churn_state['mean'], color='#e74c3c', alpha=0.8)
        plt.title("Churn Rate by US State (min 30 customers)")
        plt.xlabel("Churn Rate")
        plt.tight_layout()
        plt.savefig(_ROOT / "visualizations" / "churn_by_state.png", dpi=150)
        print("US state chart saved: visualizations/churn_by_state.png")

df_model = df[feature_cols].copy()
for col in df_model.select_dtypes(include='object').columns:
    df_model[col] = LabelEncoder().fit_transform(df_model[col].astype(str))

X = df_model
y = df['churned']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
)

scaler    = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s  = scaler.transform(X_test)

print(f"\nTrain: {X_train.shape[0]:,} | Test: {X_test.shape[0]:,}")
print(f"Train churn rate: {y_train.mean():.1%}")

pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

models = {
    "Logistic Regression": LogisticRegression(
        max_iter=1000, class_weight='balanced', random_state=RANDOM_STATE
    ),
    "Random Forest": RandomForestClassifier(
        n_estimators=200, class_weight='balanced',
        max_depth=8, random_state=RANDOM_STATE
    ),
    "XGBoost": XGBClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        scale_pos_weight=pos_weight,
        use_label_encoder=False, eval_metric='logloss',
        random_state=RANDOM_STATE
    )
}

results = {}
for name, model in models.items():
    Xtr = X_train_s if name == "Logistic Regression" else X_train
    Xte = X_test_s  if name == "Logistic Regression" else X_test
    model.fit(Xtr, y_train)
    probs = model.predict_proba(Xte)[:, 1]
    preds = model.predict(Xte)
    auc   = roc_auc_score(y_test, probs)
    results[name] = {"model": model, "probs": probs, "preds": preds, "auc": auc}
    print(f"\n{'='*45}")
    print(f"{name} | ROC-AUC: {auc:.4f}")
    print(classification_report(y_test, preds))

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

for name, r in results.items():
    RocCurveDisplay.from_predictions(
        y_test, r["probs"], name=f"{name} (AUC={r['auc']:.3f})", ax=axes[0]
    )
axes[0].set_title("ROC Curves — All Models")

importances = pd.Series(
    results["XGBoost"]["model"].feature_importances_, index=X.columns
).sort_values(ascending=False).head(15)
importances.plot(kind="barh", ax=axes[1], color="#e67e22")
axes[1].set_title("Top 15 Feature Importances (XGBoost)")
axes[1].invert_yaxis()

plt.tight_layout()
plt.savefig(_ROOT / "visualizations" / "model_results.png", dpi=150)
print("\nModel results saved: visualizations/model_results.png")

best_name  = max(results, key=lambda k: results[k]['auc'])
best_model = results[best_name]["model"]

if best_name == "Logistic Regression":
    full_probs = best_model.predict_proba(scaler.transform(X))[:, 1]
else:
    full_probs = best_model.predict_proba(X)[:, 1]

top3 = importances.head(3).index.tolist()

def risk_tier(p):
    if p >= 0.70: return "High"
    elif p >= 0.40: return "Medium"
    return "Low"

preds_df = pd.DataFrame({
    "user_id":              df.get('user_id', pd.Series(range(len(df)))).values,
    "churn_probability":    full_probs.round(4),
    "risk_tier":            [risk_tier(p) for p in full_probs],
    "actual_churned":       y.values,
    "total_orders":         df['total_orders'].values,
    "total_revenue":        df['total_revenue'].values,
    "orders_per_month":     df['orders_per_month'].values,
    "customer_tenure_days": df['customer_tenure_days'].values,
    "return_rate":          df['return_rate'].values,
    "one_time_buyer":       df['one_time_buyer'].values,
    "rfm_frequency_score":  df['rfm_frequency_score'].values,
    "rfm_monetary_score":   df['rfm_monetary_score'].values,
    "age_bucket":           df['age_bucket'].values,
    "gender":               df['gender'].values,
    "traffic_source":       df['traffic_source'].values,
    "top_feature_1":        top3[0],
    "top_feature_2":        top3[1],
    "top_feature_3":        top3[2],
})

preds_df.to_csv(OUTPUT_PATH, index=False)
print(f"\n✅ Predictions saved: {OUTPUT_PATH}")
print(preds_df['risk_tier'].value_counts())

best_auc = results[best_name]['auc']
print(f"\nBest model: {best_name} | ROC-AUC: {best_auc:.4f}")
print("\nPhase 1 complete → Next: Phase 2 — Push to Supabase")