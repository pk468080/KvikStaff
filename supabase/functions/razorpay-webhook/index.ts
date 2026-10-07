import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );

  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  try {
    const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (
      !secret ||
      !supabaseUrl ||
      !serviceRoleKey ||
      !razorpayKeyId ||
      !razorpayKeySecret
    ) {
      console.error("[KvikStaff] Razorpay webhook configuration is incomplete.");
      return jsonResponse(
        { success: false, error: "Webhook configuration is incomplete." },
        500,
      );
    }

    const rawBody = await req.text();
    const receivedSignature =
      req.headers.get("X-Razorpay-Signature") ?? "";
    const eventId =
      req.headers.get("X-Razorpay-Event-Id") ??
      req.headers.get("x-razorpay-event-id") ??
      "";

    if (!receivedSignature || !eventId) {
      return jsonResponse(
        { success: false, error: "Invalid webhook headers." },
        400,
      );
    }

    const expectedSignature = await hmacSha256(secret, rawBody);

    if (!timingSafeEqual(expectedSignature, receivedSignature)) {
      return jsonResponse(
        { success: false, error: "Invalid webhook signature." },
        400,
      );
    }

    const payload = JSON.parse(rawBody) as Record<string, any>;
    const eventType =
      typeof payload.event === "string"
        ? payload.event
        : "unknown";

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    const paymentEntity =
      payload?.payload?.payment?.entity ?? null;

    const orderEntity =
      payload?.payload?.order?.entity ?? null;

    const orderId =
      typeof paymentEntity?.order_id === "string"
        ? paymentEntity.order_id
        : typeof orderEntity?.id === "string"
          ? orderEntity.id
          : null;

    const paymentId =
      typeof paymentEntity?.id === "string"
        ? paymentEntity.id
        : null;

   const { error: eventInsertError } = await supabase
  .from("razorpay_webhook_events")
  .insert({
    event_id: eventId,
    event_type: eventType,
    order_id: orderId,
    payment_id: paymentId,
    payload,
  });

if (eventInsertError) {
  /*
   * Razorpay retries webhook deliveries.
   *
   * A duplicate event ID means the event was already recorded.
   * Do NOT return immediately because the previous attempt may
   * have failed after recording the event but before payment
   * finalization completed.
   *
   * Continue into the normal reconciliation path. The
   * finalize_razorpay_payment RPC is idempotent and will safely
   * handle an already-finalized payment.
   */
  if (
    eventInsertError.code !== "23505"
  ) {
    throw eventInsertError;
  }
}

    if (
      eventType !== "payment.captured" &&
      eventType !== "order.paid"
    ) {
      return jsonResponse({
        success: true,
        ignored: true,
        event: eventType,
      });
    }

    if (!orderId) {
      throw new Error(
        "Razorpay webhook does not contain an order ID.",
      );
    }

    let providerPaymentId = paymentId;
let providerPayment: Record<string, any> | null =
  paymentEntity;

const authHeader =
  `Basic ${btoa(
    `${razorpayKeyId}:${razorpayKeySecret}`,
  )}`;

if (providerPaymentId) {
  /*
   * payment.captured normally includes the payment entity.
   *
   * We still fetch the authoritative Razorpay payment record
   * instead of trusting the webhook entity blindly.
   */
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(
      providerPaymentId,
    )}`,
    {
      headers: {
        Authorization: authHeader,
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
    throw new Error(
      data?.error?.description ||
        "Unable to verify Razorpay payment.",
    );
  }

  providerPayment = data;
} else {
  /*
   * order.paid may not contain a payment entity.
   *
   * In that case fetch all payments for the order and reconcile
   * only when exactly one captured payment can be safely selected.
   *
   * Never choose an arbitrary captured payment from the list.
   */
  const response = await fetch(
    `https://api.razorpay.com/v1/orders/${encodeURIComponent(
      orderId,
    )}/payments`,
    {
      headers: {
        Authorization: authHeader,
      },
    },
  );

  const data =
    await response
      .json()
      .catch(
        () => null,
      );

  if (
    !response.ok ||
    !Array.isArray(data?.items)
  ) {
    throw new Error(
      "Unable to fetch Razorpay payments for webhook reconciliation.",
    );
  }

  const capturedPayments =
    data.items.filter(
      (
        payment: Record<string, unknown>,
      ) =>
        payment.status ===
        "captured" &&
        payment.order_id ===
          orderId &&
        typeof payment.id ===
          "string",
    );

  /*
   * Exactly one captured payment is required when the webhook
   * does not identify the payment explicitly.
   */
  if (
    capturedPayments.length ===
    0
  ) {
    throw new Error(
      "Razorpay order is paid but no captured payment is available yet.",
    );
  }

  if (
    capturedPayments.length >
    1
  ) {
    throw new Error(
      "Razorpay order has multiple captured payments and the webhook does not identify which payment belongs to KvikStaff. Manual reconciliation is required.",
    );
  }

  const captured =
    capturedPayments[0];

  providerPaymentId =
    String(captured.id);

  /*
   * Fetch the authoritative provider record rather than
   * finalizing directly from the list response.
   */
  const providerResponse =
    await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(
        providerPaymentId,
      )}`,
      {
        headers: {
          Authorization:
            authHeader,
        },
      },
    );

  const providerData =
    await providerResponse
      .json()
      .catch(
        () => null,
      );

  if (
    !providerResponse.ok
  ) {
    throw new Error(
      providerData?.error
        ?.description ||
        "Unable to verify Razorpay payment.",
    );
  }

  providerPayment =
    providerData;
}

if (
  !providerPayment ||
  providerPayment.status !==
    "captured" ||
  providerPayment.order_id !==
    orderId
) {
  throw new Error(
    "Webhook payment is not a captured payment for the supplied order.",
  );
}

    const { data: payment, error: paymentLookupError } =
      await supabase
        .from("payments")
        .select(
          "id,booking_id,amount,currency,status,provider_order_id",
        )
        .eq("provider", "razorpay")
        .eq("provider_order_id", orderId)
        .maybeSingle();

    if (paymentLookupError) {
      throw paymentLookupError;
    }

    if (!payment) {
      throw new Error(
        "Local payment record was not found for the Razorpay order.",
      );
    }

    if (
      Number(payment.amount) * 100 !==
      Number(providerPayment.amount) ||
      payment.currency !== providerPayment.currency
    ) {
      throw new Error(
        "Razorpay payment amount or currency does not match the local payment.",
      );
    }

    const { data: finalization, error: finalizationError } =
      await supabase.rpc(
        "finalize_razorpay_payment",
        {
          p_payment_id: payment.id,
          p_provider_payment_id: String(providerPayment.id),
          p_paid_at:
            typeof providerPayment.created_at === "number"
              ? new Date(
                  providerPayment.created_at * 1000,
                ).toISOString()
              : new Date().toISOString(),
        },
      );

    if (finalizationError) {
      throw finalizationError;
    }

    if (
      !finalization ||
      finalization.success !== true
    ) {
      throw new Error(
        "Razorpay payment was verified but local finalization did not succeed.",
      );
    }

    return jsonResponse({
      success: true,
      event: eventType,
      bookingId: payment.booking_id,
      paymentId: String(providerPayment.id),
      status: finalization.booking_status ?? "paid",
    });
  } catch (error) {
    console.error(
      "[KvikStaff] razorpay-webhook error:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected webhook error.",
      },
      500,
    );
  }
});
