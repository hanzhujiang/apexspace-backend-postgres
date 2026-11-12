-- Monthly P&L schema additions.
-- Dev/staging auto-apply via `sequelize.sync({ alter: true })` on backend start.
-- For production, run this script once. All statements are idempotent.

-- 1. Fixed monthly fee per platform (e.g. shop subscription).
ALTER TABLE platforms
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(12, 2) DEFAULT 0;

-- 2. Monthly ads spend. `platform_id IS NULL` is the per-month "Total" row.
CREATE TABLE IF NOT EXISTS ads_spend (
  id          SERIAL PRIMARY KEY,
  removed     BOOLEAN       NOT NULL DEFAULT FALSE,
  year        INTEGER       NOT NULL,
  month       INTEGER       NOT NULL,
  platform_id INTEGER       NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ads_spend_year_month_platform_uq
  ON ads_spend (year, month, platform_id);

-- 3. Historical monthly P&L snapshot. Upserted when GET /monthly-pnl runs.
CREATE TABLE IF NOT EXISTS monthly_sales_summary (
  id             SERIAL PRIMARY KEY,
  year           INTEGER       NOT NULL,
  month          INTEGER       NOT NULL,
  revenue        NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_of_goods  NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_cost  NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_profit   NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_margin   NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ads_cost       NUMERIC(14,2) NOT NULL DEFAULT 0,
  platform_fees  NUMERIC(14,2) NOT NULL DEFAULT 0,
  labor_cost     NUMERIC(14,2) NOT NULL DEFAULT 0,
  warehouse_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  loss           NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax            NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_profit     NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_margin     NUMERIC(6,4)  NOT NULL DEFAULT 0,
  created        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_sales_summary_year_month_uq
  ON monthly_sales_summary (year, month);
