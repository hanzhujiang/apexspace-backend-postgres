-- One-time backfill: populate sales.gross_profit for all existing rows.
-- Formula mirrors salesController.computeGrossProfit():
--   gp = (sale_price_aud + shipping_price_aud) * platform.fee_rate
--      - platform.fee_fixed - shipping_cost_aud - cost_aud
--
-- Prereq: cost_aud_total_cost_2026_11_28 must have run first — this backfill
-- assumes cost_aud is total cost for the row.
--
-- Idempotent — guarded by the `schema_migrations` marker.
-- Reversible — pre-mutation values are snapshotted to
-- `sales_backup_gross_profit_2026_11_28`. Run
-- `backfill_gross_profit_rollback.sql` to restore.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'backfill_gross_profit_2026_11_28'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM schema_migrations WHERE name = 'cost_aud_total_cost_2026_11_28'
    ) THEN
      RAISE EXCEPTION 'Run cost_aud_total_cost.sql before backfill_gross_profit.sql';
    END IF;

    EXECUTE 'DROP TABLE IF EXISTS sales_backup_gross_profit_2026_11_28';
    EXECUTE 'CREATE TABLE sales_backup_gross_profit_2026_11_28 AS '
         || 'SELECT id, gross_profit FROM sales';

    UPDATE sales s
    SET gross_profit = (
      COALESCE(s.sale_price_aud, 0) + COALESCE(s.shipping_price_aud, 0)
    ) * COALESCE(p.fee_rate, 0)
      - COALESCE(p.fee_fixed, 0)
      - COALESCE(s.shipping_cost_aud, 0)
      - COALESCE(s.cost_aud, 0)
    FROM platforms p
    WHERE LOWER(p.name) = LOWER(s.platform)
      AND s.removed = FALSE;

    INSERT INTO schema_migrations (name) VALUES ('backfill_gross_profit_2026_11_28');
  END IF;
END $$;
