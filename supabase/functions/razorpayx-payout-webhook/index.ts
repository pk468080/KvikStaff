import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
async function hmacSha256(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature)).map((v)=>v.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for(let i = 0; i < a.length; i += 1)result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((v)=>v.toString(16).padStart(2, "0")).join("");
}
Deno.serve(async (req)=>{
  if (req.method !== "POST") return json({
    success: false,
    error: "Method not allowed"
  }, 405);
  try {
    const secret = Deno.env.get("RAZORPAYX_WEBHOOK_SECRET") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!secret || !supabaseUrl || !serviceRoleKey) return json({
      success: false,
      error: "Webhook configuration is incomplete."
    }, 503);
    const rawBody = await req.text();
    const receivedSignature = req.headers.get("X-Razorpay-Signature") ?? "";
    if (!receivedSignature) return json({
      success: false,
      error: "Webhook signature is missing."
    }, 400);
    const expectedSignature = await hmacSha256(secret, rawBody);
    if (!timingSafeEqual(expectedSignature, receivedSignature)) return json({
      success: false,
      error: "Invalid webhook signature."
    }, 400);
    const payload = JSON.parse(rawBody);
    const eventType = typeof payload.event === "string" ? payload.event : "";
    if (!eventType.startsWith("payout.")) return json({
      success: true,
      ignored: true,
      event: eventType || "unknown"
    });
    const eventId = (req.headers.get("X-Razorpay-Event-Id") ?? req.headers.get("x-razorpay-event-id") ?? "").trim() || await sha256Hex(rawBody);
    const entity = payload?.payload?.payout?.entity ?? null;
    const providerPayoutId = typeof entity?.id === "string" ? entity.id : null;
    const providerStatus = typeof entity?.status === "string" ? entity.status : null;
    const amountPaise = Number(entity?.amount);
    const currency = typeof entity?.currency === "string" ? entity.currency : null;
    const fundAccountId = typeof entity?.fund_account_id === "string" ? entity.fund_account_id : null;
    const providerFees = Number(entity?.fees);
    const providerTax = Number(entity?.tax);
    const providerCreatedAt = typeof entity?.created_at === "number" ? new Date(entity.created_at * 1000).toISOString() : null;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: existingEvent, error: existingEventError } = await admin.from("worker_payout_webhook_events").select("id, processed_at").eq("event_id", eventId).maybeSingle();
    if (existingEventError) throw existingEventError;
    if (existingEvent?.processed_at) return json({
      success: true,
      duplicate: true
    });
    if (!existingEvent) {
      const { error } = await admin.from("worker_payout_webhook_events").insert({
        event_id: eventId,
        event_type: eventType,
        provider_payout_id: providerPayoutId,
        provider_status: providerStatus,
        amount: Number.isFinite(amountPaise) ? amountPaise / 100 : null,
        currency,
        fund_account_id: fundAccountId,
        utr: typeof entity?.utr === "string" ? entity.utr : null,
        status_details: entity?.status_details && typeof entity.status_details === "object" ? entity.status_details : null
      });
      if (error && error.code !== "23505") throw error;
    }
    if (!providerPayoutId || !providerStatus || !Number.isInteger(amountPaise) || currency !== "INR" || !fundAccountId) {
      await admin.from("worker_payout_webhook_events").update({
        processed_at: new Date().toISOString(),
        processing_error: "Webhook did not contain a complete payout entity."
      }).eq("event_id", eventId);
      return json({
        success: true,
        unmatched: true
      });
    }
    const { data: payout, error: lookupError } = await admin.from("worker_payouts").select("id, amount, currency, provider_payout_id").eq("provider", "razorpayx").eq("provider_payout_id", providerPayoutId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!payout) {
      await admin.from("worker_payout_webhook_events").update({
        processing_error: "Local payout was not found for provider payout ID."
      }).eq("event_id", eventId);
      return json({
        success: true,
        unmatched: true
      });
    }
    if (Number(payout.amount) * 100 !== amountPaise || payout.currency !== "INR") {
      await admin.from("worker_payout_webhook_events").update({
        processing_error: "Provider payout amount or currency did not match local payout."
      }).eq("event_id", eventId);
      return json({
        success: false,
        error: "Payout amount or currency mismatch."
      }, 409);
    }
    const { data: updated, error: updateError } = await admin.rpc("apply_worker_payout_provider_update", {
      p_payout_id: payout.id,
      p_provider_payout_id: providerPayoutId,
      p_provider_status: providerStatus,
      p_amount_paise: amountPaise,
      p_currency: "INR",
      p_fund_account_id: fundAccountId,
      p_utr: typeof entity?.utr === "string" ? entity.utr : null,
      p_fees_paise: Number.isFinite(providerFees) ? Math.trunc(providerFees) : null,
      p_tax_paise: Number.isFinite(providerTax) ? Math.trunc(providerTax) : null,
      p_status_details: entity?.status_details && typeof entity.status_details === "object" ? entity.status_details : null,
      p_failure_reason: typeof entity?.failure_reason === "string" ? entity.failure_reason.slice(0, 500) : null,
      p_created_at: providerCreatedAt
    });
    if (updateError) throw updateError;
    const { error: eventUpdateError } = await admin.from("worker_payout_webhook_events").update({
      processed_at: new Date().toISOString(),
      processing_error: null
    }).eq("event_id", eventId);
    if (eventUpdateError) throw eventUpdateError;
    return json({
      success: true,
      payoutId: updated?.id ?? payout.id,
      status: updated?.status ?? providerStatus
    });
  } catch (error) {
    console.error("[TempStaff] razorpayx-payout-webhook failed:", error);
    return json({
      success: false,
      error: "Unable to process payout webhook."
    }, 500);
  }
});
