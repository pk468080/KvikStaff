import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function timingSafeEqual(
  a: Uint8Array,
  b: Uint8Array
) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

function hexToBytes(
  hex: string
) {
  if (
    hex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(hex)
  ) {
    return null;
  }

  const bytes =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < bytes.length;
    i += 1
  ) {
    bytes[i] =
      Number.parseInt(
        hex.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return bytes;
}

async function createHmacSha256(
  secret: string,
  message: string
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message)
    );

  return new Uint8Array(
    signature
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "Method not allowed",
        },
        405
      );
    }

    const authorization =
      req.headers.get(
        "Authorization"
      );

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error:
            "Authentication required.",
        },
        401
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL"
      );

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    const razorpayKeyId =
      Deno.env.get(
        "RAZORPAY_KEY_ID"
      );

    const razorpayKeySecret =
      Deno.env.get(
        "RAZORPAY_KEY_SECRET"
      );

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      throw new Error(
        "Supabase server configuration is missing."
      );
    }

    if (
      !razorpayKeyId ||
      !razorpayKeySecret
    ) {
      throw new Error(
        "Razorpay secrets are not configured."
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },
        }
      );

    const {
      data: {
        user,
      },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Authentication required.",
        },
        401
      );
    }

    const body =
      await req.json();

    const bookingId =
      body?.bookingId;

    const razorpayOrderId =
      body?.razorpayOrderId;

    const razorpayPaymentId =
      body?.razorpayPaymentId;

    const razorpaySignature =
      body?.razorpaySignature;

    if (
      typeof bookingId !==
        "string" ||
      !bookingId
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "bookingId is required.",
        },
        400
      );
    }

    if (
      typeof razorpayOrderId !==
        "string" ||
      !razorpayOrderId
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay order ID is required.",
        },
        400
      );
    }

    if (
      typeof razorpayPaymentId !==
        "string" ||
      !razorpayPaymentId
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay payment ID is required.",
        },
        400
      );
    }

    if (
      typeof razorpaySignature !==
        "string" ||
      !razorpaySignature
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay signature is required.",
        },
        400
      );
    }

    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    const {
      data: booking,
      error: bookingError,
    } =
      await adminClient
        .from("bookings")
        .select(
          `
            id,
            customer_id,
            status,
            fulfillment_type,
            total_amount,
            pricing_snapshot
          `
        )
        .eq(
          "id",
          bookingId
        )
        .eq(
          "customer_id",
          user.id
        )
        .maybeSingle();

    if (bookingError) {
      console.error(
        "Booking lookup failed:",
        bookingError
      );

      throw new Error(
        "Unable to load booking."
      );
    }

    if (!booking) {
      return jsonResponse(
        {
          success: false,
          error:
            "Booking not found.",
        },
        404
      );
    }

    /*
     * All booking types now share the same
     * payment verification lifecycle.
     */
    if (
      booking.fulfillment_type !==
        "instant" &&
      booking.fulfillment_type !==
        "scheduled" &&
      booking.fulfillment_type !==
        "recurring"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "This booking type is not supported for Razorpay payments.",
        },
        400
      );
    }

    const {
      data: payment,
      error: paymentError,
    } =
      await adminClient
        .from("payments")
        .select(
          `
            id,
            booking_id,
            provider,
            provider_order_id,
            provider_payment_id,
            amount,
            currency,
            status
          `
        )
        .eq(
          "booking_id",
          bookingId
        )
        .eq(
          "provider",
          "razorpay"
        )
        .eq(
          "provider_order_id",
          razorpayOrderId
        )
        .maybeSingle();

    if (paymentError) {
      console.error(
        "Payment lookup failed:",
        paymentError
      );

      throw new Error(
        "Unable to load payment."
      );
    }

    if (!payment) {
      return jsonResponse(
        {
          success: false,
          error:
            "Payment order was not found.",
        },
        404
      );
    }

    /*
     * Idempotency.
     */
    if (
      payment.status ===
        "paid" &&
      payment.provider_payment_id ===
        razorpayPaymentId
    ) {
      return jsonResponse({
        success: true,
        bookingId,
        paymentId:
          razorpayPaymentId,
        status: "paid",
      });
    }

    const expectedAmount =
      Number(
        booking.total_amount
      );

    const paymentAmount =
      Number(
        payment.amount
      );

    if (
      !Number.isFinite(
        expectedAmount
      ) ||
      expectedAmount <= 0
    ) {
      throw new Error(
        "Booking has an invalid payment amount."
      );
    }

    if (
      !Number.isFinite(
        paymentAmount
      ) ||
      paymentAmount <= 0
    ) {
      throw new Error(
        "Payment has an invalid amount."
      );
    }

    if (
      Math.round(
        expectedAmount * 100
      ) !==
      Math.round(
        paymentAmount * 100
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Payment amount does not match booking amount.",
        },
        409
      );
    }

    const pricingSnapshot =
      booking.pricing_snapshot;

    const expectedCurrency =
      pricingSnapshot &&
      typeof pricingSnapshot ===
        "object" &&
      "currency" in
        pricingSnapshot &&
      typeof pricingSnapshot.currency ===
        "string"
        ? pricingSnapshot.currency
        : null;

    if (!expectedCurrency) {
      throw new Error(
        "Booking payment currency is missing."
      );
    }

    if (
      payment.currency !==
      expectedCurrency
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Payment currency does not match booking currency.",
        },
        409
      );
    }

    /*
     * Verify the Razorpay checkout signature.
     */
    const expectedSignature =
      await createHmacSha256(
        razorpayKeySecret,
        `${razorpayOrderId}|${razorpayPaymentId}`
      );

    const receivedSignature =
      hexToBytes(
        razorpaySignature
      );

    if (
      !receivedSignature ||
      !timingSafeEqual(
        expectedSignature,
        receivedSignature
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Invalid Razorpay payment signature.",
        },
        400
      );
    }

    /*
     * Verify the actual payment directly
     * against Razorpay.
     */
    const razorpayAuth =
      btoa(
        `${razorpayKeyId}:${razorpayKeySecret}`
      );

    const razorpayPaymentResponse =
      await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(
          razorpayPaymentId
        )}`,
        {
          method: "GET",
          headers: {
            Authorization:
              `Basic ${razorpayAuth}`,
          },
        }
      );

    const razorpayPayment =
      await razorpayPaymentResponse.json();

    if (
      !razorpayPaymentResponse.ok
    ) {
      console.error(
        "Razorpay payment lookup failed:",
        razorpayPayment
      );

      throw new Error(
        razorpayPayment?.error?.description ||
          "Unable to verify Razorpay payment."
      );
    }

    if (
      razorpayPayment.order_id !==
      razorpayOrderId
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay payment does not belong to this order.",
        },
        409
      );
    }

    if (
      razorpayPayment.currency !==
      expectedCurrency
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay currency does not match booking currency.",
        },
        409
      );
    }

    if (
      Number(
        razorpayPayment.amount
      ) !==
      Math.round(
        expectedAmount * 100
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Razorpay amount does not match booking amount.",
        },
        409
      );
    }

    /*
 * Authorization is a legitimate intermediate Razorpay state.
 *
 * Do NOT treat it as payment failure. Automatic capture may
 * happen shortly after authorization, and the Razorpay webhook
 * remains authoritative for the captured -> paid transition.
 */
if (
  razorpayPayment.status ===
  "authorized"
) {
  return jsonResponse({
    success: true,
    paymentPending: true,
    bookingId,
    paymentId: razorpayPaymentId,
    status: "authorized",
  });
}

/*
 * Only a captured payment can finalize the booking.
 */
if (
  razorpayPayment.status !==
  "captured"
) {
  return jsonResponse(
    {
      success: false,
      error:
        razorpayPayment.status === "failed"
          ? "Razorpay payment failed."
          : "Razorpay payment is still being processed.",
    },
    409
  );
}

    /*
     * Finalize through the authoritative
     * server-side payment RPC.
     *
     * The RPC locks the payment and booking,
     * records the provider payment ID,
     * marks the payment paid,
     * transitions the booking to paid,
     * and performs worker assignment/search.
     */
    const {
      data:
        finalizationResult,
      error:
        finalizationError,
    } =
      await adminClient.rpc(
        "finalize_razorpay_payment",
        {
          p_payment_id:
            payment.id,
          p_provider_payment_id:
            razorpayPaymentId,
          p_paid_at:
            typeof razorpayPayment.created_at ===
            "number"
              ? new Date(
                  razorpayPayment.created_at *
                    1000
                ).toISOString()
              : new Date().toISOString(),
        }
      );

    if (
      finalizationError
    ) {
      console.error(
        "Razorpay payment finalization failed:",
        finalizationError
      );

      throw new Error(
        "Payment was verified, but could not be finalized."
      );
    }

    if (
      !finalizationResult ||
      finalizationResult.success !==
        true
    ) {
      console.error(
        "Unexpected Razorpay finalization result:",
        finalizationResult
      );

      throw new Error(
        "Payment was verified, but could not be finalized."
      );
    }

    return jsonResponse({
      success: true,
      bookingId,
      paymentId:
        razorpayPaymentId,
      status:
        finalizationResult.booking_status ??
        "paid",
      assigned:
        finalizationResult.assigned ??
        false,
      workerId:
        finalizationResult.worker_id ??
        null,
      finalization:
        finalizationResult,
    });
     } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error.";

    console.error(
      "[TempStaff] verify-razorpay-payment error:",
      message,
      error,
    );

    /*
     * Return a structured application response so the
     * customer app receives the actual server error
     * instead of only:
     *
     * "Edge Function returned a non-2xx status code"
     *
     * This does NOT mean the payment is accepted.
     * success remains false until every server-side
     * verification step succeeds.
     */
    return jsonResponse(
      {
        success: false,
        error: message,
      },
      200,
    );
  }
});