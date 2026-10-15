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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405
    );
  }

  let failureBookingId: string | null = null;
  let shouldMarkPaymentFailed = false;

  try {
    const authorization =
      req.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        {
          success: false,
          error: "Authentication required.",
        },
        401
      );
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    const razorpayKeyId =
      Deno.env.get("RAZORPAY_KEY_ID");

    const razorpayKeySecret =
      Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
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

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error:
            "Authentication required.",
        },
        401
      );
    }

    const body = await req.json();

    const bookingId =
      body?.bookingId;

    const action =
      body?.action ?? null;

    if (
      typeof bookingId !== "string" ||
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

    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey
      );

    /*
     * Explicit payment-failure transition.
     *
     * This is called by the customer app when
     * checkout is cancelled or the payment attempt
     * fails before verification.
     */
    if (
      action ===
      "mark_payment_failed"
    ) {
      const {
        data: booking,
        error: bookingError,
      } =
        await adminClient
          .from("bookings")
          .select(
            "id, customer_id, status, fulfillment_type"
          )
          .eq("id", bookingId)
          .eq(
            "customer_id",
            user.id
          )
          .maybeSingle();

      if (bookingError) {
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

      if (
        booking.status ===
        "pending_payment"
      ) {
        const {
          error: updateError,
        } =
          await adminClient
            .from("bookings")
            .update({
              status:
                "payment_failed",
            })
            .eq(
              "id",
              bookingId
            )
            .eq(
              "customer_id",
              user.id
            )
            .eq(
              "status",
              "pending_payment"
            );

        if (updateError) {
          throw new Error(
            "Unable to mark payment as failed."
          );
        }
      }

      return jsonResponse({
        success: true,
        bookingId,
        status:
          booking.status ===
          "pending_payment"
            ? "payment_failed"
            : booking.status,
      });
    }

    /*
     * Load the booking.
     *
     * Amount and currency are always taken from
     * persisted booking data. Client-provided price
     * values are intentionally ignored.
     */
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
            service_variant_id,
            total_amount,
            pricing_snapshot,
            scheduled_start
          `
        )
        .eq("id", bookingId)
        .eq(
          "customer_id",
          user.id
        )
        .maybeSingle();

    if (bookingError) {
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

    failureBookingId =
      bookingId;

    /*
     * A customer must not be able to pay for an
     * Instant or Scheduled booking after its service
     * start time has already passed.
     *
     * Recurring bookings are intentionally excluded
     * because their parent scheduled_start represents
     * the series and future occurrences may remain.
     */
    if (
      (
        booking.fulfillment_type ===
          "instant" ||
        booking.fulfillment_type ===
          "scheduled"
      ) &&
      (
        booking.status ===
          "pending_payment" ||
        booking.status ===
          "payment_failed"
      ) &&
      typeof booking.scheduled_start ===
        "string"
    ) {
      const scheduledStartMs =
        new Date(
          booking.scheduled_start
        ).getTime();

      if (
        Number.isFinite(
          scheduledStartMs
        ) &&
        scheduledStartMs <=
          Date.now()
      ) {
        const {
          error:
            expireError,
        } =
          await adminClient
            .from("bookings")
            .update({
              status:
                "expired",
            })
            .eq(
              "id",
              bookingId
            )
            .eq(
              "customer_id",
              user.id
            )
            .in(
              "status",
              [
                "pending_payment",
                "payment_failed",
              ]
            );

        if (expireError) {
          throw new Error(
            "Unable to expire the past booking."
          );
        }

        return jsonResponse(
          {
            success: false,
            error:
              "This booking has expired because its scheduled time has passed.",
            bookingId,
            status:
              "expired",
          },
          409
        );
      }
    }

    /*
     * All supported booking types use the same
     * payment lifecycle.
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

    if (
      booking.status !==
        "pending_payment" &&
      booking.status !==
        "payment_failed"
    ) {
      if (
        booking.status ===
        "paid"
      ) {
        return jsonResponse(
          {
            success: true,
            alreadyPaid: true,
            bookingId,
            status: "paid",
          }
        );
      }

      return jsonResponse(
        {
          success: false,
          error:
            "This booking is not available for payment.",
        },
        409
      );
    }

    const amount =
      Number(
        booking.total_amount
      );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Booking has an invalid payment amount."
      );
    }

    const pricingSnapshot =
      booking.pricing_snapshot;

    const currency =
      pricingSnapshot &&
      typeof pricingSnapshot ===
        "object" &&
      "currency" in
        pricingSnapshot &&
      typeof pricingSnapshot.currency ===
        "string"
        ? pricingSnapshot.currency
        : null;

    if (!currency) {
      throw new Error(
        "Booking payment currency is missing."
      );
    }

    const packageId =
      booking.service_variant_id;

    if (
      typeof packageId !==
        "string" ||
      !packageId
    ) {
      throw new Error(
        "The booking service variant is missing."
      );
    }

    /*
     * If the booking previously failed payment,
     * return it to pending_payment before creating
     * or reusing a Razorpay order.
     */
    if (
      booking.status ===
      "payment_failed"
    ) {
      const {
        error: resetError,
      } =
        await adminClient
          .from("bookings")
          .update({
            status:
              "pending_payment",
          })
          .eq(
            "id",
            bookingId
          )
          .eq(
            "status",
            "payment_failed"
          );

      if (resetError) {
        throw new Error(
          "Unable to reopen booking for payment."
        );
      }
    }

    shouldMarkPaymentFailed =
      true;

    /*
     * Reuse an existing local Razorpay payment
     * record where possible.
     */
    const {
      data: existingPayment,
      error: existingPaymentError,
    } =
      await adminClient
        .from("payments")
        .select(
          `
            id,
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
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (existingPaymentError) {
      throw new Error(
        "Unable to load existing payment."
      );
    }

    if (
      existingPayment &&
      existingPayment.provider_order_id
    ) {
      if (
        Number(
          existingPayment.amount
        ) !== amount ||
        existingPayment.currency !==
          currency
      ) {
        throw new Error(
          "Existing payment does not match booking amount."
        );
      }

      /*
       * Verify whether the existing Razorpay order
       * has already been captured.
       */
      const razorpayAuth =
        btoa(
          `${razorpayKeyId}:${razorpayKeySecret}`
        );

      const paymentResponse =
        await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(
            existingPayment.provider_order_id
          )}/payments`,
          {
            method: "GET",
            headers: {
              Authorization:
                `Basic ${razorpayAuth}`,
            },
          }
        );

      const paymentData =
        await paymentResponse.json();

      if (
        paymentResponse.ok &&
        Array.isArray(
          paymentData?.items
        )
      ) {
        const capturedPayment =
          paymentData.items.find(
            (
              payment: Record<
                string,
                unknown
              >
            ) =>
              payment.status ===
              "captured"
          );

        if (capturedPayment) {
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
                  existingPayment.id,
                p_provider_payment_id:
                  String(
                    capturedPayment.id
                  ),
                p_paid_at:
                  typeof capturedPayment.created_at ===
                  "number"
                    ? new Date(
                        capturedPayment.created_at *
                          1000
                      ).toISOString()
                    : new Date().toISOString(),
              }
            );

          if (
            finalizationError
          ) {
            throw new Error(
              "A Razorpay payment was found, but it could not be finalized."
            );
          }

          if (
            !finalizationResult ||
            finalizationResult.success !==
              true
          ) {
            throw new Error(
              "A Razorpay payment was found, but it could not be finalized."
            );
          }

          shouldMarkPaymentFailed =
            false;

          return jsonResponse({
            success: true,
            alreadyPaid: true,
            bookingId,
            paymentId:
              String(
                capturedPayment.id
              ),
            status:
              finalizationResult.booking_status ??
              "paid",
            assigned:
              finalizationResult.assigned ??
              false,
            workerId:
              finalizationResult.worker_id ??
              null,
          });
        }
      }

      /*
       * No captured payment exists.
       * Reuse the existing pending order.
       */
      return jsonResponse({
        success: true,
        keyId:
          razorpayKeyId,
        orderId:
          existingPayment.provider_order_id,
        amount:
          Math.round(
            amount * 100
          ),
        currency,
      });
    }

    const amountInPaise =
      Math.round(
        amount * 100
      );

    if (
      !Number.isInteger(
        amountInPaise
      ) ||
      amountInPaise <= 0
    ) {
      throw new Error(
        "Invalid payment amount."
      );
    }

    const receipt =
      `ts_${bookingId}`;

    const razorpayAuth =
      btoa(
        `${razorpayKeyId}:${razorpayKeySecret}`
      );

    const razorpayResponse =
      await fetch(
        "https://api.razorpay.com/v1/orders",
        {
          method: "POST",
          headers: {
            Authorization:
              `Basic ${razorpayAuth}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            amount:
              amountInPaise,
            currency,
            receipt,
            notes: {
              tempstaff_booking_id:
                bookingId,
              fulfillment_type:
                booking.fulfillment_type,
            },
          }),
        }
      );

    const razorpayData =
      await razorpayResponse.json();

    if (
      !razorpayResponse.ok
    ) {
      console.error(
        "Razorpay order creation failed:",
        razorpayData
      );

      throw new Error(
        razorpayData?.error?.description ||
          "Unable to create Razorpay order."
      );
    }

    const {
      error:
        paymentInsertError,
    } =
      await adminClient
        .from("payments")
        .insert({
          booking_id:
            bookingId,
          provider:
            "razorpay",
          provider_order_id:
            razorpayData.id,
          amount,
          currency,
          status:
            "pending",
        });

    if (paymentInsertError) {
      throw new Error(
        "Unable to create payment record."
      );
    }

    return jsonResponse({
      success: true,
      keyId:
        razorpayKeyId,
      orderId:
        razorpayData.id,
      amount:
        razorpayData.amount,
      currency:
        razorpayData.currency,
      receipt:
        razorpayData.receipt,
    });
  } catch (error) {
    if (
      shouldMarkPaymentFailed &&
      failureBookingId
    ) {
      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL"
        );

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        );

      if (
        supabaseUrl &&
        serviceRoleKey
      ) {
        const statusClient =
          createClient(
            supabaseUrl,
            serviceRoleKey
          );

        const {
          error:
            statusError,
        } =
          await statusClient
            .from("bookings")
            .update({
              status:
                "payment_failed",
            })
            .eq(
              "id",
              failureBookingId
            )
            .eq(
              "status",
              "pending_payment"
            );

        if (statusError) {
          console.error(
            "Unable to mark failed payment order:",
            statusError
          );
        }
      }
    }

    console.error(
      "[TempStaff] create-razorpay-order error:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500
    );
  }
});