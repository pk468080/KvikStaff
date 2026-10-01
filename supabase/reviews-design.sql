-- Design artifact only. This file documents the migration that should be applied
-- by the project owner in the production Supabase project during the final release.
-- It is intentionally not executed here.

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  occurrence_id uuid NULL REFERENCES public.booking_schedule_occurrences(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker_profiles(id) ON DELETE RESTRICT,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_booking_occurrence_scope
    CHECK (
      (occurrence_id IS NULL AND booking_id IS NOT NULL)
      OR (occurrence_id IS NOT NULL AND booking_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX reviews_one_per_booking
  ON public.reviews (booking_id)
  WHERE occurrence_id IS NULL;

CREATE UNIQUE INDEX reviews_one_per_occurrence
  ON public.reviews (occurrence_id)
  WHERE occurrence_id IS NOT NULL;

CREATE INDEX reviews_customer_id_idx ON public.reviews (customer_id);
CREATE INDEX reviews_worker_id_idx ON public.reviews (worker_id);

CREATE OR REPLACE FUNCTION public.set_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_reviews_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read their own reviews"
ON public.reviews
FOR SELECT
USING (auth.uid() = customer_id);

CREATE POLICY "Customers can insert their own review for their own completed booking"
ON public.reviews
FOR INSERT
WITH CHECK (
  auth.uid() = customer_id
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = reviews.booking_id
      AND b.customer_id = auth.uid()
      AND b.status = 'completed'
  )
  AND (
    reviews.occurrence_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.booking_schedule_occurrences o
      WHERE o.id = reviews.occurrence_id
        AND o.booking_id = reviews.booking_id
        AND o.status = 'completed'
        AND o.worker_id = reviews.worker_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.reviews existing
    WHERE existing.booking_id = reviews.booking_id
      AND (
        reviews.occurrence_id IS NULL
          AND existing.occurrence_id IS NULL
        OR reviews.occurrence_id IS NOT NULL
          AND existing.occurrence_id = reviews.occurrence_id
      )
  )
);

CREATE POLICY "Customers can update only their own reviews"
ON public.reviews
FOR UPDATE
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can delete only their own reviews"
ON public.reviews
FOR DELETE
USING (auth.uid() = customer_id);

-- Optional public read policy for aggregated worker/service metrics can be added
-- later without exposing customer private review content.
