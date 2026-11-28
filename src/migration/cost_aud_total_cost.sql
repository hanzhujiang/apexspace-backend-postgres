-- One-time data migration for sales.cost_aud.
-- After this runs, cost_aud is the TOTAL cost of goods for a sales row and the
-- P&L / gross-profit code paths treat it directly (no × quantity).
--
-- Two steps:
--   1. Rows with a per-unit cost already stored → cost_aud := cost_aud * quantity.
--   2. Rows with cost_aud 0/NULL (mobile-created sales, Kogan imports with no
--      matching ProductCosts window at import time, etc.) → look up the active
--      ProductCosts window for the sale's SKU + date and apply (cost × qty).
--
-- Mirrors salesController.lookupSkuCostAt() at the SQL level so freshly-saved
-- rows and backfilled rows agree on the formula.
--
-- Idempotent — guarded by the `schema_migrations` marker. Safe to re-run.
-- Reversible — pre-mutation values are snapshotted to
-- `sales_backup_cost_aud_2026_11_28`. Run `cost_aud_total_cost_rollback.sql`
-- to restore.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'cost_aud_total_cost_2026_11_28'
  ) THEN
    -- Snapshot pre-migration values so the rollback script has something to
    -- restore from. Dropped first so a re-run after a rollback captures the
    -- current state rather than the stale snapshot.
    EXECUTE 'DROP TABLE IF EXISTS sales_backup_cost_aud_2026_11_28';
    EXECUTE 'CREATE TABLE sales_backup_cost_aud_2026_11_28 AS '
         || 'SELECT id, cost_aud, gross_profit FROM sales';

    -- 1. Convert per-unit → total for rows that already have a cost.
    UPDATE sales
    SET cost_aud = cost_aud * quantity
    WHERE cost_aud IS NOT NULL
      AND cost_aud > 0
      AND quantity > 0;

    -- 2. Backfill rows that have no cost yet, using the ProductCosts window
    -- that covers the sale's date. Pick the most-recent date_from when
    -- multiple windows overlap, matching the controller's tie-breaker.
    UPDATE sales s
    SET cost_aud = pc.cost * s.quantity
    FROM product_costs pc
    WHERE s.removed = FALSE
      AND (s.cost_aud IS NULL OR s.cost_aud = 0)
      AND s.quantity > 0
      AND s.date IS NOT NULL
      AND s.sku = pc.sku
      AND pc.removed = FALSE
      AND pc.date_from <= s.date::date
      AND (pc.date_to IS NULL OR pc.date_to >= s.date::date)
      AND pc.date_from = (
        SELECT MAX(pc2.date_from)
        FROM product_costs pc2
        WHERE pc2.sku = s.sku
          AND pc2.removed = FALSE
          AND pc2.date_from <= s.date::date
          AND (pc2.date_to IS NULL OR pc2.date_to >= s.date::date)
      );

    INSERT INTO schema_migrations (name) VALUES ('cost_aud_total_cost_2026_11_28');
  END IF;
END $$;
