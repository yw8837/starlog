-- lib/pay/maintenance.ts deletes the account day counts by day (kst_day < ?) every 10 minutes. The primary key of
-- account_day_counts (0021) starts with account_key, so that delete scanned the whole table (code review 2026-11-05).
CREATE INDEX account_day_counts_by_day ON account_day_counts(kst_day);
