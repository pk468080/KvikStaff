import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function internalAuthorized(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const secret = req.headers.get("x-tempstaff-payout-secret") ?? "";
  if (!secret) return false;

  const response = await fetch(
    supabaseUrl + "/rest/v1/rpc/verify_worker_payout_processor_secret",
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: "Bearer " + serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_secret: secret }),
    },
  );

  if (!response.ok) return false;
  const result = await response.json().catch(() => false);
  return result === true;
}

function providerToLocalStatus(status: unknown): string | null {
  const value = typeof status === "string" ? status : "";
  if (
    [
      "queued",
      "pending",
      "rejected",
      "processing",
      "processed",
      "cancelled",
      "reversed",
      "failed",
    ].includes(value)
  ) {
    return value;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const keyId = Deno.env.get("RAZORPAYX_KEY_ID") ?? "";
    const keySecret = Deno.env.get("RAZORPAYX_KEY_SECRET") ?? "";
    const customerIdentifier =
      Deno.env.get("RAZORPAYX_CUSTOMER_IDENTIFIER") ?? "";
    const enabled =
      (Deno.env.get("RAZORPAYX_PAYOUTS_ENABLED") ?? "").toLowerCase() ===
      "true";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { success: false, error: "Server configuration is incomplete." },
        503,
      );
    }

    if (!await internalAuthorized(req, supabaseUrl, serviceRoleKey)) {
      return json({ success: false, error: "Unauthorized." }, 401);
    }

    if (!enabled || !keyId || !keySecret || !customerIdentifier) {
      return json({
        success: true,
        skipped: true,
        reason: "RazorpayX payout processing is disabled.",
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: payouts, error: listError } = await admin
      .from("worker_payouts")
      .select(
        "id, worker_id, payout_account_id, amount, currency, status, provider_payout_id, reconciliation_attempts",
      )
      .in("status", ["queued", "pending", "processing"])
      .lt(
        "created_at",
        new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      )
      .or(
        "last_reconciled_at.is.null,last_reconciled_at.lt." +
          new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: true })
      .limit(25);

    if (listError) throw listError;

    let matched = 0;
    let updated = 0;
    let unresolved = 0;
    let failed = 0;

    for (const payout of payouts ?? []) {
      const attempts =
        Number(payout.reconciliation_attempts ?? 0) + 1;

      try {
        const { data: account, error: accountError } = await admin
          .from("worker_payout_accounts")
          .select("provider_fund_account_id")
          .eq("id", payout.payout_account_id)
          .eq("worker_id", payout.worker_id)
          .maybeSingle();

        if (accountError) throw accountError;

        const params = new URLSearchParams({
          account_number: customerIdentifier,
          reference_id: payout.id,
          count: "100",
        });

        const response = await fetch(
          "https://api.razorpay.com/v1/payouts?" + params.toString(),
          {
            headers: {
              Authorization:
                "Basic " + btoa(keyId + ":" + keySecret),
            },
          },
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(data?.items)) {
          throw new Error(
            "RazorpayX reconciliation request failed",
          );
        }

        const candidates = data.items.filter(
          (item: Record<string, unknown>) =>
            item?.reference_id === payout.id &&
            item?.currency === "INR" &&
            Number(item?.amount) ===
              Math.round(Number(payout.amount) * 100) &&
            (!account?.provider_fund_account_id ||
              item?.fund_account_id ===
                account.provider_fund_account_id),
        );

        if (candidates.length !== 1) {
          unresolved += 1;

          const { error: markError } = await admin
            .from("worker_payouts")
            .update({
              last_reconciled_at: new Date().toISOString(),
              reconciliation_attempts: attempts,
              reconciliation_error:
                candidates.length === 0
                  ? "No unique matching provider payout was found during reconciliation."
                  : "Multiple matching provider payouts were found; manual reconciliation is required.",
              updated_at: new Date().toISOString(),
            })
            .eq("id", payout.id);

          if (markError) throw markError;
          continue;
        }

        matched += 1;

        const provider =
          candidates[0] as Record<string, unknown>;
        const providerStatus =
          providerToLocalStatus(provider.status);

        if (!providerStatus) {
          throw new Error(
            "Provider returned an unsupported payout status",
          );
        }

        const providerFees = Number(provider.fees);
        const providerTax = Number(provider.tax);
        const providerCreatedAt =
          typeof provider.created_at === "number"
            ? new Date(
                provider.created_at * 1000,
              ).toISOString()
            : null;

        const { data: applied, error: applyError } =
          await admin.rpc(
            "apply_worker_payout_provider_update",
            {
              p_payout_id: payout.id,
              p_provider_payout_id:
                typeof provider.id === "string"
                  ? provider.id
                  : null,
              p_provider_status:
                typeof provider.status === "string"
                  ? provider.status
                  : providerStatus,
              p_amount_paise: Math.round(
                Number(payout.amount) * 100,
              ),
              p_currency:
                typeof provider.currency === "string"
                  ? provider.currency
                  : "INR",
              p_fund_account_id:
                typeof provider.fund_account_id === "string"
                  ? provider.fund_account_id
                  : null,
              p_utr:
                typeof provider.utr === "string"
                  ? provider.utr
                  : null,
              p_fees_paise: Number.isFinite(providerFees)
                ? providerFees
                : null,
              p_tax_paise: Number.isFinite(providerTax)
                ? providerTax
                : null,
              p_status_details:
                provider.status_details &&
                typeof provider.status_details === "object"
                  ? provider.status_details
                  : null,
              p_failure_reason:
                typeof provider.failure_reason === "string"
                  ? provider.failure_reason.slice(0, 500)
                  : null,
              p_created_at: providerCreatedAt,
            },
          );

        if (applyError) throw applyError;

        await admin
          .from("worker_payouts")
          .update({
            reconciliation_attempts: attempts,
            reconciliation_error: null,
            last_reconciled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", payout.id);

        if (applied !== null) updated += 1;
      } catch (error) {
        failed += 1;

        await admin
          .from("worker_payouts")
          .update({
            last_reconciled_at: new Date().toISOString(),
            reconciliation_attempts: attempts,
            reconciliation_error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Reconciliation failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payout.id);
      }
    }

    return json({
      success: true,
      examined: payouts?.length ?? 0,
      matched,
      updated,
      unresolved,
      failed,
    });
  } catch (error) {
    console.error(
      "[TempStaff] reconcile-worker-payouts failed:",
      error,
    );
    return json(
      {
        success: false,
        error: "Unable to reconcile worker payouts.",
      },
      500,
    );
  }
});