-- Signal — Phase 1 Foundation · 0002 SHARED FUNCTIONS (COMMON)
-- Purpose: reusable trigger function with no table dependencies.
--   * set_updated_at() → generic BEFORE UPDATE trigger to maintain updated_at.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.set_updated_at() IS 'BEFORE UPDATE trigger: stamps updated_at = now().';
