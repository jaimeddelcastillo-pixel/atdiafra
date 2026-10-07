-- Copia de referencia de drizzle/migrations/0007_audit_export_word.sql (ya aplicada en Lovable Cloud).
ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_operation_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_operation_check CHECK (operation = ANY (ARRAY['INSERT','UPDATE','DELETE','EXPORT_WORD']));
