BEGIN;

-- Remove client privileges inherited from the schema-only CI baseline as
-- well as direct grants. Preserve service_role and database-owner grants.
REVOKE ALL PRIVILEGES ON TABLE
  public.addresses,
  public.bookings,
  public.profiles,
  public.worker_profiles,
  public.worker_documents,
  public.worker_locations,
  public.messages,
  public.conversations,
  public.payments,
  public.payment_refunds,
  public.worker_payout_accounts,
  public.worker_payouts,
  public.support_tickets,
  public.worker_applications
FROM PUBLIC, anon, authenticated;

-- Regrant only the direct table operations required by the application.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.addresses TO authenticated;
GRANT SELECT ON TABLE public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.worker_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.worker_documents TO authenticated;
GRANT SELECT, INSERT
  ON TABLE public.worker_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.conversations TO authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.payment_refunds TO authenticated;
GRANT SELECT ON TABLE public.support_tickets TO authenticated;
GRANT SELECT ON TABLE public.worker_applications TO authenticated;

-- Payout tables deliberately have no direct authenticated table access.
COMMIT;
