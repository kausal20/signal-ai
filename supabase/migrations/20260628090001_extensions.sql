-- ============================================================================
-- Signal — Phase 1 Foundation · 0001 EXTENSIONS
-- Purpose: enable the Postgres extensions the foundation schema depends on.
--   pgcrypto → gen_random_uuid() for UUID primary keys.
-- pgvector / pg_cron / pg_net are intentionally NOT enabled here — they belong
-- to later phases (embeddings, scheduled jobs) and are out of Phase 1 scope.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
