
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function mapProviderStatus(status: string | null): string {
  switch (status) {
    case "queued": return "queued";
    case "pending": return "pending";
    case "rejected": return "rejected";
    case "processing": return "processing";
    case "processed": return "processed";
    case "cancelled": return "cancelled";
    case "reversed": return "reversed";
    case "failed": return "failed";
    default: return "processing";
  }
}

function safeNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const token = bearerToken(req);
    if (!token) return json({ success: false, error: "Authentication required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const keyId = Deno.env.get("RAZORPAYX_KEY_ID") ?? "";
    const keySecret = Deno.env.get("RAZORPAYX_KEY_SECRET") ?? "";
    const customerIdentifier = Deno.env.get("RAZORPAYX_CUSTOMER_IDENTIFIER") ?? "";
    const enabled = (Deno.env.get("RAZORPAYX_PAYOUTS_ENABLED") ?? "").toLowerCase() === "true";

    if (!supabaseUrl || !serviceRoleKey) return json({ success: false, error: "Server configuration is incomplete." }, 503);
    if (!enabled || !keyId || !keySecret || !customerIdentifier) {
      return json({ success: false, error: "RazorpayX payout processing is not enabled." }, 503);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authResult = await adminClient.auth.getUser(token);
    const user = authResult.data?.user ?? null;
    if (authResult.error || !user) return json({ success: false, error: "Authentication required." }, 401);

    const { data: adminProfile, error: adminProfileError } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle();
    if (adminProfileError) throw adminProfileError;
    if (!adminProfile || adminProfile.role !== "admin" || adminProfile.is_active !== true) {
      return json({ success: false, error: "Admin access required." }, 403);
    }

    const body = await req.json().catch(() => null);
    const payoutId = typeof body?.payoutId === "string" ? body.payoutId.trim() : "";
    if (!payoutId) return json({ success: false, error: "payoutId is required." }, 400);

    const { data: payout, error: payoutError } = await adminClient
      .from("worker_payouts")
      .select("id, worker_id, payout_account_id, amount, currency, status, provider_payout_id, idempotency_key, mode, purpose")
      .eq("id", payoutId)
      .maybeSingle();
    if (payoutError) throw payoutError;
    if (!payout) return json({ success: false, error: "Payout not found." }, 404);

    if (payout.provider_payout_id) {
      return json({ success: true, payout });
    }

    if (!["queued", "processing"].includes(payout.status)) {
      return json({ success: true, payout, skipped: true });
    }

    const { data: account, error: accountError } = await adminClient
      .from("worker_payout_accounts")
      .select("id, provider_fund_account_id, status")
      .eq("id", payout.payout_account_id)
      .eq("worker_id", payout.worker_id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account || account.status !== "verified" || !account.provider_fund_account_id) {
      return json({ success: false, error: "Verified payout account is not available." }, 409);
    }

    const amountRupees = safeNumber(payout.amount);
    const amountPaise = amountRupees === null ? NaN : Math.round(amountRupees * 100);
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      return json({ success: false, error: "Payout amount is invalid." }, 400);
    }

    await adminClient
      .from("worker_payouts")
      .update({ status: "processing" })
      .eq("id", payout.id)
      .in("status", ["queued", "processing"])
      .is("provider_payout_id", null);

    const providerResponse = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(keyId + ":" + keySecret),
        "Content-Type": "application/json",
        "X-Payout-Idempotency": payout.idempotency_key,
      },
      body: JSON.stringify({
        account_number: customerIdentifier,
        fund_account_id: account.provider_fund_account_id,
        amount: amountPaise,
        currency: "INR",
        mode: payout.mode || "IMPS",
        purpose: payout.purpose || "payout",
        queue_if_low_balance: true,
        reference_id: payout.id,
        narration: "TempStaff Payout",
      }),
    });

    const providerData = await providerResponse.json().catch(() => null);

    if (!providerResponse.ok) {
      if (providerResponse.status >= 400 && providerResponse.status < 500) {
        const providerError = typeof providerData?.error?.description === "string"
          ? providerData.error.description.slice(0, 500)
          : "RazorpayX rejected the payout request.";
        const errorCode = typeof providerData?.error?.reason === "string"
          ? providerData.error.reason.slice(0, 100)
          : null;
        const { data: failedPayout } = await adminClient
          .from("worker_payouts")
          .update({
            status: "failed",
            failure_reason: providerError,
            failure_code: errorCode,
          })
          .eq("id", payout.id)
          .is("provider_payout_id", null)
          .select("*")
          .single();
        return json({ success: false, error: providerError, payout: failedPayout ?? null }, 409);
      }

      return json({
        success: false,
        processing: true,
        error: "RazorpayX payout request could not be confirmed. It remains in processing for safe reconciliation.",
      }, 503);
    }

    const providerPayoutId = typeof providerData?.id === "string" ? providerData.id : "";
    const providerAmount = safeNumber(providerData?.amount);
    const providerCurrency = typeof providerData?.currency === "string" ? providerData.currency : "";
    if (!providerPayoutId || providerAmount !== amountPaise || providerCurrency !== "INR") {
      return json({
        success: false,
        processing: true,
        error: "RazorpayX returned an unexpected payout response. Local payout remains processing for reconciliation.",
      }, 502);
    }

    const providerStatus = typeof providerData?.status === "string" ? providerData.status : "processing";
    const mappedStatus = mapProviderStatus(providerStatus);
    const providerCreatedAt = typeof providerData?.created_at === "number"
      ? new Date(providerData.created_at * 1000).toISOString()
      : null;

    const { data: updated, error: updateError } = await adminClient
      .from("worker_payouts")
      .update({
        provider_payout_id: providerPayoutId,
        provider_status: providerStatus,
        status: mappedStatus,
        utr: typeof providerData?.utr === "string" ? providerData.utr : null,
        provider_fee_amount: safeNumber(providerData?.fees) !== null ? safeNumber(providerData?.fees)! / 100 : 0,
        provider_tax_amount: safeNumber(providerData?.tax) !== null ? safeNumber(providerData?.tax)! / 100 : 0,
        provider_status_details: providerData?.status_details ?? null,
        provider_created_at: providerCreatedAt,
        processed_at: mappedStatus === "processed" ? new Date().toISOString() : null,
        failure_reason: typeof providerData?.failure_reason === "string" ? providerData.failure_reason.slice(0, 500) : null,
      })
      .eq("id", payout.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return json({ success: true, payout: updated });
  } catch (error) {
    console.error("[TempStaff] process-worker-payout failed:", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Unable to process payout." }, 500);
  }
});
