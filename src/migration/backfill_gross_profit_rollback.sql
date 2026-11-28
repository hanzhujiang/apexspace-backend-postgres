-- Rollback for backfill_gross_profit.sql.
-- Restores sales.gross_profit from the snapshot taken when the forward
-- migration ran. Only touches rows present in the snapshot — sales created
-- after the forward migration are left alone (they already store their
-- gross_profit correctly via the controller).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE name = 'backfill_gross_profit_2026_11_28'
  ) THEN
    RAISE NOTICE 'backfill_gross_profit is not currently applied — nothing to roll back.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sales_backup_gross_profit_2026_11_28'
  ) THEN
    RAISE EXCEPTION 'Backup table sales_backup_gross_profit_2026_11_28 is missing; cannot roll back.';
  END IF;

  UPDATE sales s
  SET gross_profit = b.gross_profit
  FROM sales_backup_gross_profit_2026_11_28 b
  WHERE s.id = b.id;

  DELETE FROM schema_migrations WHERE name = 'backfill_gross_profit_2026_11_28';
  INSERT INTO schema_migrations (name)
  VALUES ('backfill_gross_profit_2026_11_28_rolled_back')
  ON CONFLICT (name) DO UPDATE SET applied_at = NOW();
END $$;
