DROP TABLE IF EXISTS risk_scores;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  user_id               BIGINT PRIMARY KEY,
  age_bucket            TEXT,
  gender                TEXT,
  traffic_source        TEXT,

  total_orders          INTEGER,
  total_revenue         NUMERIC(10, 2),
  avg_order_value       NUMERIC(10, 2),
  orders_per_month      NUMERIC(8, 3),
  customer_tenure_days  INTEGER,
  return_rate           NUMERIC(5, 3),
  one_time_buyer        BOOLEAN,

  rfm_frequency_score   SMALLINT,
  rfm_monetary_score    SMALLINT,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE risk_scores (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT REFERENCES customers(user_id) ON DELETE CASCADE,

  churn_probability     NUMERIC(6, 4),
  risk_tier             TEXT CHECK (risk_tier IN ('High', 'Medium', 'Low')),
  actual_churned        BOOLEAN,

  top_feature_1         TEXT,
  top_feature_2         TEXT,
  top_feature_3         TEXT,

  scored_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_tier       ON risk_scores(risk_tier);
CREATE INDEX idx_churn_prob      ON risk_scores(churn_probability DESC);
CREATE INDEX idx_customer_tier   ON risk_scores(user_id, risk_tier);

CREATE OR REPLACE VIEW vw_customer_risk AS
SELECT
  c.user_id,
  c.age_bucket,
  c.gender,
  c.traffic_source,
  c.total_orders,
  c.total_revenue,
  c.avg_order_value,
  c.orders_per_month,
  c.customer_tenure_days,
  c.return_rate,
  c.one_time_buyer,
  c.rfm_frequency_score,
  c.rfm_monetary_score,
  r.churn_probability,
  r.risk_tier,
  r.actual_churned,
  r.top_feature_1,
  r.top_feature_2,
  r.top_feature_3,
  r.scored_at
FROM customers c
JOIN risk_scores r ON c.user_id = r.user_id;

CREATE OR REPLACE VIEW vw_segment_summary AS
SELECT
  risk_tier,
  age_bucket,
  gender,
  traffic_source,
  COUNT(*)                          AS user_count,
  ROUND(AVG(churn_probability), 3)  AS avg_churn_prob,
  ROUND(SUM(total_revenue), 2)      AS total_revenue_at_risk,
  ROUND(AVG(total_orders), 1)       AS avg_orders,
  ROUND(AVG(orders_per_month), 2)   AS avg_orders_per_month,
  ROUND(AVG(return_rate), 3)        AS avg_return_rate,
  SUM(CASE WHEN one_time_buyer THEN 1 ELSE 0 END) AS one_time_buyers
FROM vw_customer_risk
GROUP BY risk_tier, age_bucket, gender, traffic_source;

SELECT
  risk_tier,
  COUNT(*) AS users,
  ROUND(AVG(churn_probability), 3) AS avg_score,
  ROUND(SUM(total_revenue), 2) AS revenue_at_risk
FROM vw_customer_risk
GROUP BY risk_tier
ORDER BY avg_score DESC;
