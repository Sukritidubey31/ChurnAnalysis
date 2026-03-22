# ChurnLens

ChurnLens is an end-to-end customer risk scoring engine built on 80,000+ TheLook ecommerce customers. It identifies $6.3M in at-risk revenue, explains why customers are churning, and lets you ask an AI analyst natural language questions about the data.

The project started as a churn prediction model and evolved into something more useful: a behavioral scoring system that tells a retention team exactly who to prioritize, why they're at risk, and what to do about it.

---

## See it live

📊 [Tableau Dashboard](https://public.tableau.com/views/ChurnLens/ChurnLens)  
🤖 [AI Analyst Chatbot] — (https://churnlensapp.vercel.app/) 
📓 [Analysis Notebook](./ChurnLens_Analysis.ipynb)

---

## What I found in the data

The most surprising finding wasn't about which segment had the highest churn rate. It was this: **three-quarters of high-risk customers never made a second purchase**. This isn't a retention problem. It's an activation problem. The business is losing customers between the first and second order, not after years of engagement.

A few other things that shaped the whole project:

Retained customers order 10 to 15 times more frequently than churned ones. That single behavioral gap drives 60% of the model's decisions and directly explains why purchase frequency ended up as the centerpiece of both the scoring model and the dashboard.

Facebook-acquired customers aged 45 to 54 showed the highest churn probability across every segment. Email-acquired customers showed the lowest. The channel you use to acquire a customer has a measurable effect on whether they ever come back.

The total revenue at risk from high-risk customers is $5.82M. That number isn't abstract — the dashboard shows you exactly which customers it's coming from and what their behavioral profile looks like.

---

## How it's built

The project runs across five layers, each one feeding the next.

**BigQuery** handles the data engineering. The raw TheLook dataset lives across four tables — users, orders, order_items, and events. A single SQL query joins them, defines churn as no completed order in the last 90 days, and engineers the base features. The churn definition is worth noting: TheLook has no built-in churn column, so defining it yourself is part of the analytical work.

**Python and XGBoost** handle the modeling. Three models were trained and compared (Logistic Regression, Random Forest, and XGBoost). The first run came back with an AUC of 1.0 across all three — which is a red flag, not a win. The root cause was data leakage: several features were mathematically derived from the churn definition itself. Once those were removed and documented, the model settled into its actual role as a behavioral risk scorer rather than a forecasting model. The full leakage detection process is in the notebook.

**Supabase** stores the scored predictions in a PostgreSQL database with two views that power both the dashboard and the chatbot. The upload process handles 80K rows in batches with retry logic for network drops.

**Tableau** turns the scores into four views, each one answering a specific business question. The risk distribution shows how serious the problem is. The segment heatmap shows where to focus. The customer table shows who to contact. The feature importance chart shows why they're at risk. Each view was chosen because EDA surfaced a pattern worth communicating — the rationale is documented in the notebook.

**The AI chatbot** is a Next.js app that pulls live segment data from Supabase and sends it to Claude as context. When you ask it a question, it's answering from the actual database numbers, not from general knowledge. You can ask things like "which segment has the most revenue at risk" or "give me a retention plan for 25 to 34 year old females" and get back answers grounded in the real data.

---

## Running it yourself

You'll need Python 3.9+, Node.js 18+, a Supabase account, an Anthropic API key, and BigQuery access (the Google Cloud free tier works fine).

Start by running `thelook_churn_query.sql` in the BigQuery console against `bigquery-public-data.thelook_ecommerce` and exporting the result as `churn_features.csv`.

Then run the Python pipeline:

```bash
pip install pandas numpy scikit-learn xgboost matplotlib seaborn supabase python-dotenv
python thelook_churn_pipeline.py
```

Set up Supabase by running `supabase_schema.sql` in the SQL Editor, adding your credentials to a `.env` file, and running the uploader:

```bash
python supabase_upload.py
```

For the chatbot:

```bash
cd churnlens-app
npm install
npm run dev
```

Add your Supabase URL, anon key, and Anthropic API key to `.env.local` before running.

---

## The notebook

`ChurnLens_Analysis.ipynb` is the best place to understand the analytical decisions behind the project. It covers the data overview and why TheLook was chosen over more common datasets, the EDA that shaped every downstream decision, the reasoning behind each engineered feature, the model comparison and why XGBoost was selected, the leakage detection process in detail, and how each EDA finding maps to a specific dashboard view.

---

## Files

```
ChurnLens_Analysis.ipynb        full analysis notebook
thelook_churn_query.sql         BigQuery SQL
thelook_churn_pipeline.py       feature engineering and modeling
supabase_schema.sql             database schema and views
supabase_upload.py              batch uploader
supabase_backfill.py            backfill for missing rows
churnlens_phase4_briefs.py      Anthropic API retention brief generator
churnlens-app/                  Next.js chatbot
```

---

## Stack

BigQuery · Python · XGBoost · Supabase · Tableau · Next.js · TypeScript · Anthropic Claude API

---

**Sukriti Dubey**  
MEng Engineering Management, Cornell University  
[LinkedIn](https://www.linkedin.com/in/sukriti-dubey)
