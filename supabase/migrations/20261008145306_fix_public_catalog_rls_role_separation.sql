
DROP POLICY IF EXISTS service_categories_public_active_select
ON public.service_categories;

CREATE POLICY service_categories_public_active_select
ON public.service_categories
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY service_categories_authenticated_select
ON public.service_categories
FOR SELECT
TO authenticated
USING ((is_active = true) OR (select public.is_admin()));


DROP POLICY IF EXISTS service_variant_prices_public_select
ON public.service_variant_prices;

CREATE POLICY service_variant_prices_public_select
ON public.service_variant_prices
FOR SELECT
TO anon
USING (
  is_active = true
  AND effective_from <= now()
  AND (effective_to IS NULL OR effective_to > now())
  AND EXISTS (
    SELECT 1
    FROM public.service_variants sv
    JOIN public.services s ON s.id = sv.service_id
    WHERE sv.id = service_variant_prices.service_variant_id
      AND sv.is_active = true
      AND s.is_active = true
  )
);

CREATE POLICY service_variant_prices_authenticated_select
ON public.service_variant_prices
FOR SELECT
TO authenticated
USING (
  (
    is_active = true
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
    AND EXISTS (
      SELECT 1
      FROM public.service_variants sv
      JOIN public.services s ON s.id = sv.service_id
      WHERE sv.id = service_variant_prices.service_variant_id
        AND sv.is_active = true
        AND s.is_active = true
    )
  )
  OR (select public.is_admin())
);


DROP POLICY IF EXISTS service_variants_public_select
ON public.service_variants;

CREATE POLICY service_variants_public_select
ON public.service_variants
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY service_variants_authenticated_select
ON public.service_variants
FOR SELECT
TO authenticated
USING ((is_active = true) OR (select public.is_admin()));


DROP POLICY IF EXISTS services_public_select
ON public.services;

CREATE POLICY services_public_select
ON public.services
FOR SELECT
TO anon
USING (is_active = true);

CREATE POLICY services_authenticated_select
ON public.services
FOR SELECT
TO authenticated
USING ((is_active = true) OR (select public.is_admin()));
;
