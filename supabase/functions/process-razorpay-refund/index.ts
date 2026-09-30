import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tempstaff-refund-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

type RefundRow = {
  id: string;
  payment_id: string;
  booking_id: string;
  amount: number | string;
  currency: string;
  status: string;
  provider_refund_id: string | null;
  failure_reason: string | null;
  refund_request_id: string | null;
  updated_at?: string;
};

function basicAuth(
  keyId: string,
  keySecret: string,
) {
  return `Basic ${btoa(
    `${keyId}:${keySecret}`,
  )}`;
}

async function isInternalServiceRequest(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const processorSecret =
    req.headers.get(
      "x-tempstaff-refund-secret",
    ) ??
    "";

  if (!processorSecret) {
    return false;
  }

  try {
    const response =
      await fetch(
        `${supabaseUrl}/rest/v1/rpc/verify_refund_processor_secret`,
        {
          method: "POST",
          headers: {
            apikey:
              serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`,
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              p_secret:
                processorSecret,
            }),
        },
      );

    if (!response.ok) {
      return false;
    }

    const result =
      await response
        .json()
        .catch(
          () => false,
        );

    return result === true;
  } catch (error) {
    console.error(
      "[TempStaff] Internal refund secret validation failed:",
      error,
    );

    return false;
  }
}

async function finalizeRefund(
  supabaseUrl: string,
  serviceRoleKey: string,
  refundId: string,
  status:
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled",
  providerRefundId?: string | null,
  failureReason?: string | null,
) {
  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/rpc/finalize_payment_refund`,
      {
        method: "POST",
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          p_refund_id:
            refundId,
          p_status:
            status,
          p_provider_refund_id:
            providerRefundId ||
            null,
          p_failure_reason:
            failureReason ||
            null,
        }),
      },
    );

  const result =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message ||
        result?.error ||
        `Unable to finalize refund as ${status}`,
    );
  }

  return result;
}

async function requeueStaleRefund(
  supabaseUrl: string,
  serviceRoleKey: string,
  refundId: string,
) {
  const response =
    await fetch(
      `${supabaseUrl}/rest/v1/rpc/requeue_stale_payment_refund`,
      {
        method: "POST",
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            p_refund_id:
              refundId,
          }),
      },
    );

  const result =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    throw new Error(
      result?.message ||
        result?.error ||
        "Unable to requeue stale refund",
    );
  }

  return result;
}
async function fetchRazorpayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
) {
  const response =
    await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(
        paymentId,
      )}`,
      {
        headers: {
          Authorization:
            basicAuth(
              keyId,
              keySecret,
            ),
        },
      },
    );

  const data =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    const error =
      new Error(
        data?.error
          ?.description ||
          data?.error?.reason ||
          `Razorpay request failed with HTTP ${response.status}`,
      );

    Object.assign(
      error,
      {
        providerStatus:
          response.status,
        providerData:
          data,
      },
    );

    throw error;
  }

  return data;
}

async function fetchRazorpayRefunds(
  paymentId: string,
  keyId: string,
  keySecret: string,
) {
  const response =
    await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(
        paymentId,
      )}/refunds?count=100`,
      {
        headers: {
          Authorization:
            basicAuth(
              keyId,
              keySecret,
            ),
        },
      },
    );

  const data =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    const error =
      new Error(
        data?.error
          ?.description ||
          data?.error?.reason ||
          `Razorpay request failed with HTTP ${response.status}`,
      );

    Object.assign(
      error,
      {
        providerStatus:
          response.status,
        providerData:
          data,
      },
    );

    throw error;
  }

  return Array.isArray(
    data?.items,
  )
    ? data.items
    : [];
}

function findMatchingRefund(
  refunds: unknown[],
  refundId: string,
) {
  return refunds.find(
    (
      item: Record<
        string,
        unknown
      >,
    ) =>
      item?.id &&
      item?.notes &&
      typeof item.notes ===
        "object" &&
      String(
        (
          item.notes as Record<
            string,
            unknown
          >
        )
          .tempstaff_refund_id ||
          "",
      ) === refundId,
  );
}

async function getAdminContext(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  if (
    await isInternalServiceRequest(
      req,
      supabaseUrl,
      serviceRoleKey,
    )
  ) {
    return {
      ok: true as const,
      mode: "internal" as const,
      userId: null,
    };
  }

  const authHeader =
    req.headers.get(
      "Authorization",
    );

  if (!authHeader) {
    return {
      ok: false as const,
      response: json(
        {
          success: false,
          error:
            "Authentication required",
        },
        401,
      ),
    };
  }

  const authResponse =
    await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            authHeader,
        },
      },
    );

  if (!authResponse.ok) {
    return {
      ok: false as const,
      response: json(
        {
          success: false,
          error:
            "Authentication could not be verified",
        },
        401,
      ),
    };
  }

  const user =
    await authResponse.json();

  const adminResponse =
    await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(
        user.id,
      )}&role=eq.admin&is_active=eq.true&select=id&limit=1`,
      {
        headers: {
          apikey:
            serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
        },
      },
    );

  const admins =
    await adminResponse
      .json()
      .catch(
        () => [],
      );

  if (
    !adminResponse.ok ||
    !Array.isArray(
      admins,
    ) ||
    admins.length !== 1
  ) {
    return {
      ok: false as const,
      response: json(
        {
          success: false,
          error:
            "Admin access required",
        },
        403,
      ),
    };
  }

  return {
    ok: true as const,
    mode: "admin" as const,
    userId:
      String(user.id),
  };
}

Deno.serve(
  async (
    req: Request,
  ) => {
    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        },
      );
    }

    try {
      if (
        req.method !==
        "POST"
      ) {
        return json(
          {
            success: false,
            error:
              "Method not allowed",
          },
          405,
        );
      }

      const body =
        await req
          .json()
          .catch(
            () => null,
          );

      const requestUrl =
        new URL(
          req.url,
        );

      const queryRefundId =
        requestUrl.searchParams.get(
          "refundId",
        );

      const refundId =
        typeof body?.refundId ===
          "string" &&
        body.refundId.trim()
          ? body.refundId.trim()
          : queryRefundId?.trim() ||
            "";

      if (!refundId) {
        return json(
          {
            success: false,
            error:
              "refundId is required",
          },
          400,
        );
      }

      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL",
        );

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY",
        );

      const keyId =
        Deno.env.get(
          "RAZORPAY_KEY_ID",
        );

      const keySecret =
        Deno.env.get(
          "RAZORPAY_KEY_SECRET",
        );

      if (
        !supabaseUrl ||
        !serviceRoleKey ||
        !keyId ||
        !keySecret
      ) {
        return json(
          {
            success: false,
            error:
              "Server payment configuration is missing",
          },
          503,
        );
      }

      const caller =
        await getAdminContext(
          req,
          supabaseUrl,
          serviceRoleKey,
        );

      if (!caller.ok) {
        return caller.response;
      }

      const supabase =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              persistSession:
                false,
              autoRefreshToken:
                false,
            },
          },
        );

      const refundResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/payment_refunds?id=eq.${encodeURIComponent(
            refundId,
          )}&select=id,payment_id,booking_id,amount,currency,status,provider_refund_id,failure_reason,refund_request_id,updated_at&limit=1`,
          {
            headers: {
              apikey:
                serviceRoleKey,
              Authorization:
                `Bearer ${serviceRoleKey}`,
            },
          },
        );

      const rows =
        await refundResponse
          .json()
          .catch(
            () => [],
          );

      if (
        !refundResponse.ok ||
        !Array.isArray(
          rows,
        ) ||
        rows.length !== 1
      ) {
        return json(
          {
            success: false,
            error:
              "Refund not found",
          },
          404,
        );
      }

      const refund =
        rows[0] as RefundRow;

      if (
        refund.status ===
        "succeeded"
      ) {
        return json({
          success: true,
          alreadyProcessed:
            true,
          refundId,
          providerRefundId:
            refund.provider_refund_id ||
            null,
        });
      }

      const paymentResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/payments?id=eq.${encodeURIComponent(
            refund.payment_id,
          )}&select=id,booking_id,provider,provider_payment_id,currency,status,amount&limit=1`,
          {
            headers: {
              apikey:
                serviceRoleKey,
              Authorization:
                `Bearer ${serviceRoleKey}`,
            },
          },
        );

      const payments =
        await paymentResponse
          .json()
          .catch(
            () => [],
          );

      if (
        !paymentResponse.ok ||
        !Array.isArray(
          payments,
        ) ||
        payments.length !== 1
      ) {
        return json(
          {
            success: false,
            processing:
              refund.status ===
              "processing",
            error:
              "Payment record could not be loaded. No provider refund request was made.",
          },
          503,
        );
      }

      const payment =
        payments[0];

      if (
        payment.provider !==
          "razorpay" ||
        !payment.provider_payment_id
      ) {
        const reason =
          payment.provider !==
          "razorpay"
            ? "Unsupported payment provider"
            : "Provider payment ID is missing";

        if (
          refund.status ===
          "pending"
        ) {
          await finalizeRefund(
            supabaseUrl,
            serviceRoleKey,
            refundId,
            "failed",
            null,
            reason,
          );

          return json(
            {
              success: false,
              error:
                reason,
            },
            409,
          );
        }

        return json(
          {
            success: false,
            processing:
              true,
            error:
              "Refund requires manual reconciliation.",
          },
          409,
        );
      }

      /*
       * A refund already in processing must never submit
       * another provider refund blindly.
       *
       * Reconcile against Razorpay first.
       */
      if (
  refund.status ===
  "processing"
) {
  try {
    /*
     * First reconcile against Razorpay.
     *
     * This is mandatory before retrying because a previous
     * request may have succeeded at the provider while the
     * network/database response was lost.
     */
    const gatewayRefunds =
      await fetchRazorpayRefunds(
        payment.provider_payment_id,
        keyId,
        keySecret,
      );

    const matchingRefund =
      findMatchingRefund(
        gatewayRefunds,
        refundId,
      );

    /*
     * Provider already contains the refund.
     *
     * Finalize locally and NEVER submit another provider request.
     */
    if (
      matchingRefund?.id
    ) {
      const finalResult =
        await finalizeRefund(
          supabaseUrl,
          serviceRoleKey,
          refundId,
          "succeeded",
          String(
            matchingRefund.id,
          ),
          null,
        );

      return json({
        success: true,
        reconciled: true,
        refundId,
        status:
          "succeeded",
        providerRefundId:
          String(
            matchingRefund.id,
          ),
        result:
          finalResult,
      });
    }

    /*
     * No matching Razorpay refund exists.
     *
     * The database dispatcher only sends processing refunds
     * after they have been stale for 10 minutes. At that point
     * it is safe to move the refund back to pending so the normal
     * claim -> provider request flow can retry.
     *
     * IMPORTANT:
     * We only do this AFTER checking Razorpay. This prevents a
     * duplicate refund when the previous provider request actually
     * succeeded but local confirmation was lost.
     */
    const requeueResult =
      await requeueStaleRefund(
        supabaseUrl,
        serviceRoleKey,
        refundId,
      );

    if (
      requeueResult?.requeued ===
      true
    ) {
      return json({
        success: true,
        requeued: true,
        refundId,
        status:
          "pending",
        error:
          "No matching Razorpay refund was found after the stale processing window. The refund was safely requeued for retry.",
      });
    }

    /*
     * The RPC may decide the refund is still fresh, already changed,
     * succeeded, or requires reconciliation.
     *
     * Do not force another provider request.
     */
    return json(
      {
        success: false,
        processing:
          true,
        refundId,
        requeueResult,
        error:
          "Refund remains under reconciliation. No duplicate Razorpay refund was submitted.",
      },
      409,
    );
  } catch (
    error
  ) {
    console.error(
      "[TempStaff] Razorpay refund reconciliation failed:",
      error,
    );

    /*
     * Never requeue when provider reconciliation itself failed.
     *
     * We cannot safely know whether the previous provider request
     * succeeded, so the refund must remain processing until a later
     * reconciliation attempt succeeds.
     */
    return json(
      {
        success: false,
        processing:
          true,
        error:
          "Razorpay reconciliation failed. The refund remains processing and no duplicate refund was attempted.",
      },
      502,
    );
  }
}

      if (
        refund.status !==
        "pending"
      ) {
        return json(
          {
            success: false,
            error:
              `Refund is not processable in status ${refund.status}`,
          },
          409,
        );
      }

      let providerPayment:
        Record<
          string,
          any
        >;

      try {
        providerPayment =
          await fetchRazorpayPayment(
            payment.provider_payment_id,
            keyId,
            keySecret,
          );
      } catch (
        error
      ) {
        console.error(
          "[TempStaff] Razorpay payment verification failed:",
          error,
        );

        return json(
          {
            success: false,
            error:
              "Razorpay payment verification failed. The refund remains pending and no refund was submitted.",
            providerStatus:
              typeof (
                error as any
              )?.providerStatus ===
              "number"
                ? (
                    error as any
                  )
                    .providerStatus
                : null,
          },
          502,
        );
      }

      if (
        !providerPayment ||
        providerPayment.id !==
          payment.provider_payment_id
      ) {
        return json(
          {
            success: false,
            error:
              "Razorpay returned an unexpected payment record. No refund was submitted.",
          },
          502,
        );
      }

      const localAmountPaise =
        Math.round(
          Number(
            payment.amount,
          ) * 100,
        );

      const refundAmountPaise =
        Math.round(
          Number(
            refund.amount,
          ) * 100,
        );

      if (
        !Number.isFinite(
          refundAmountPaise,
        ) ||
        refundAmountPaise <=
          0
      ) {
        return json(
          {
            success: false,
            error:
              "Invalid refund amount",
          },
          409,
        );
      }

      if (
        Number(
          providerPayment.amount,
        ) !==
          localAmountPaise ||
        providerPayment.currency !==
          payment.currency
      ) {
        return json(
          {
            success: false,
            error:
              "Razorpay payment amount/currency does not match the local payment record. No refund was submitted.",
          },
          409,
        );
      }

      const providerStatus =
        String(
          providerPayment.status ||
            "",
        );

      if (
        providerStatus ===
        "refunded"
      ) {
        try {
          const gatewayRefunds =
            await fetchRazorpayRefunds(
              payment.provider_payment_id,
              keyId,
              keySecret,
            );

          const matchingRefund =
            findMatchingRefund(
              gatewayRefunds,
              refundId,
            );

          if (
            matchingRefund?.id
          ) {
            const finalResult =
              await finalizeRefund(
                supabaseUrl,
                serviceRoleKey,
                refundId,
                "succeeded",
                String(
                  matchingRefund.id,
                ),
                null,
              );

            return json({
              success: true,
              reconciled:
                true,
              refundId,
              status:
                "succeeded",
              providerRefundId:
                String(
                  matchingRefund.id,
                ),
              result:
                finalResult,
            });
          }

          return json(
            {
              success: false,
              processing:
                true,
              error:
                "Razorpay reports the payment as refunded, but this TempStaff refund was not matched. Manual reconciliation is required and no new refund was submitted.",
            },
            409,
          );
        } catch (
          error
        ) {
          console.error(
            "[TempStaff] Failed to reconcile already-refunded Razorpay payment:",
            error,
          );

          return json(
            {
              success: false,
              processing:
                true,
              error:
                "Unable to reconcile the existing Razorpay refund. No new refund was submitted.",
            },
            502,
          );
        }
      }

      if (
        providerStatus !==
        "captured"
      ) {
        return json(
          {
            success: false,
            error:
              `Razorpay payment is not refundable in status ${providerStatus || "unknown"}. The refund remains pending.`,
          },
          409,
        );
      }

      /*
       * Claiming is intentionally delegated to an atomic
       * database function in Patch 2B.
       *
       * That function locks the refund and payment rows
       * together and prevents concurrent refunds against
       * the same payment from exceeding the paid amount.
       */
      const {
        data: claimResult,
        error:
          claimError,
      } =
        await supabase.rpc(
          "claim_payment_refund",
          {
            p_refund_id:
              refundId,
          },
        );

      if (
        claimError
      ) {
        console.error(
          "[TempStaff] Refund claim failed:",
          claimError,
        );

        return json(
          {
            success: false,
            error:
              claimError.message ||
              "Refund is already being processed or could not be claimed.",
          },
          409,
        );
      }

      if (
        !claimResult ||
        claimResult.status !==
          "processing"
      ) {
        return json(
          {
            success: false,
            processing:
              true,
            error:
              "Refund could not be claimed for provider processing.",
          },
          409,
        );
      }

      /*
       * If the claim was idempotent, another worker already
       * owns this refund's processing attempt.
       *
       * Do not submit another Razorpay refund request.
       * The existing processing attempt will either finalize
       * successfully or be reconciled by the processing path.
       */
      if (
        claimResult.idempotent ===
        true
      ) {
        return json(
          {
            success: false,
            processing:
              true,
            alreadyProcessing:
              true,
            refundId,
            error:
              "Refund is already being processed. No duplicate Razorpay refund was submitted.",
          },
          409,
        );
      }

      let razorpayResponse:
        Response;

      try {
        razorpayResponse =
          await fetch(
            `https://api.razorpay.com/v1/payments/${encodeURIComponent(
              payment.provider_payment_id,
            )}/refund`,
            {
              method: "POST",
              headers: {
                Authorization:
                  basicAuth(
                    keyId,
                    keySecret,
                  ),
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  amount:
                    refundAmountPaise,
                  notes: {
                    tempstaff_refund_id:
                      refundId,
                    refund_request_id:
                      refund.refund_request_id ||
                      "",
                  },
                }),
            },
          );
      } catch (
        error
      ) {
        console.error(
          "[TempStaff] Razorpay refund request outcome is unknown:",
          error,
        );

        return json(
          {
            success: false,
            processing:
              true,
            error:
              "The Razorpay refund request outcome could not be confirmed. The refund remains processing and will be reconciled before any retry.",
          },
          502,
        );
      }

      const razorpayData =
        await razorpayResponse
          .json()
          .catch(
            () => null,
          );

      if (
        !razorpayResponse.ok
      ) {
        const failureReason =
          razorpayData?.error
            ?.description ||
          razorpayData?.error
            ?.reason ||
          `Razorpay refund failed with HTTP ${razorpayResponse.status}`;

        /*
         * Provider-side transient failures must not
         * turn a legitimate refund into a terminal failure.
         * They remain processing and are retried/reconciled.
         */
        if (
          razorpayResponse.status ===
            408 ||
          razorpayResponse.status ===
            425 ||
          razorpayResponse.status ===
            429 ||
          razorpayResponse.status >=
            500
        ) {
          return json(
            {
              success: false,
              processing:
                true,
              error:
                "Razorpay returned a temporary error. The refund remains processing and will be retried safely.",
              providerStatus:
                razorpayResponse.status,
            },
            502,
          );
        }

        await finalizeRefund(
          supabaseUrl,
          serviceRoleKey,
          refundId,
          "failed",
          null,
          failureReason,
        );

        return json(
          {
            success: false,
            error:
              failureReason,
            providerStatus:
              razorpayResponse.status,
          },
          502,
        );
      }

      const providerRefundId =
        typeof razorpayData?.id ===
        "string"
          ? razorpayData.id
          : null;

      if (
        !providerRefundId
      ) {
        return json(
          {
            success: false,
            processing:
              true,
            error:
              "Razorpay accepted the refund but did not return a refund ID. Reconciliation is required.",
          },
          502,
        );
      }

      try {
        const finalResult =
          await finalizeRefund(
            supabaseUrl,
            serviceRoleKey,
            refundId,
            "succeeded",
            providerRefundId,
            null,
          );

        return json({
          success: true,
          refundId,
          status:
            "succeeded",
          providerRefundId,
          result:
            finalResult,
        });
      } catch (
        error
      ) {
        console.error(
          "[TempStaff] Refund succeeded at Razorpay but local finalization failed:",
          error,
        );

        return json(
          {
            success: false,
            processing:
              true,
            providerRefundId,
            error:
              "Razorpay processed the refund, but local finalization failed. No duplicate refund will be attempted.",
          },
          500,
        );
      }
    } catch (
      error
    ) {
      console.error(
        "[TempStaff] process-razorpay-refund error:",
        error,
      );

      return json(
        {
          success: false,
          error:
            "Unexpected server error",
        },
        500,
      );
    }
  },
);