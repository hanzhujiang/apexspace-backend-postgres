-- Rollback for cost_aud_total_cost.sql.
-- Restores sales.cost_aud and sales.gross_profit from the snapshot taken when
-- the forward migration ran. Only touches rows present in the snapshot — sales
-- created after the forward migration are left alone.
--
-- Prereq: backfill_gross_profit must be rolled back first if it was applied —
-- otherwise gross_profit (computed off total cost_aud) would be inconsistent
-- with the restored per-unit cost_aud.

DO $$
BEGIN
  -- No-op when the forward migration isn't currently applied.
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'cost_aud_total_cost_2026_11_28'
  ) THEN
    RAISE NOTICE 'cost_aud_total_cost is not currently applied — nothing to roll back.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'backfill_gross_profit_2026_11_28'
  ) THEN
    RAISE EXCEPTION 'Roll back backfill_gross_profit first (run backfill_gross_profit_rollback.sql).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sales_backup_cost_aud_2026_11_28'
  ) THEN
    RAISE EXCEPTION 'Backup table sales_backup_cost_aud_2026_11_28 is missing; cannot roll back.';
  END IF;

  UPDATE sales s
  SET cost_aud    = b.cost_aud,
      gross_profit = b.gross_profit
  FROM sales_backup_cost_aud_2026_11_28 b
  WHERE s.id = b.id;

  DELETE FROM schema_migrations WHERE name = 'cost_aud_total_cost_2026_11_28';
  INSERT INTO schema_migrations (name)
  VALUES ('cost_aud_total_cost_2026_11_28_rolled_back')
  ON CONFLICT (name) DO UPDATE SET applied_at = NOW();
END $$;
