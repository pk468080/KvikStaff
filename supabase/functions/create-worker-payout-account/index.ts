import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function maskUpi(value: string): string {
  const parts = value.split("@");
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain) return "";
  const visible = local.length <= 2 ? local : local.slice(0, 2);
  return visible + "*".repeat(Math.max(2, local.length - visible.length)) + "@" + domain;
}

function safeAccountSummary(row: Record<string, unknown>) {
  return {
    id: row.id ?? null,
    accountType: row.account_type ?? null,
    accountHolderName: row.account_holder_name ?? null,
    bankName: row.bank_name ?? null,
    accountLast4: row.account_last4 ?? null,
    upiIdMasked: row.upi_id_masked ?? null,
    status: row.status ?? null,
    isDefault: row.is_default ?? false,
    rejectionReason: row.rejection_reason ?? null,
    verifiedAt: row.verified_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function razorpayJson(
  url: string,
  keyId: string,
  keySecret: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(keyId + ":" + keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
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

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Server configuration is incomplete." }, 503);
    }

    if (!keyId || !keySecret) {
      return json({ success: false, error: "RazorpayX payout configuration is not enabled." }, 503);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authResult = await supabaseAdmin.auth.getUser(token);
    const user = authResult.data?.user ?? null;
    if (authResult.error || !user) {
      return json({ success: false, error: "Authentication required." }, 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== "worker" || profile.is_active !== true) {
      return json({ success: false, error: "Active worker account required." }, 403);
    }

    const body = await req.json().catch(() => null);
    const accountType = normalizeText(body?.accountType);
    const holderName = normalizeText(body?.accountHolderName) || normalizeText(profile.full_name);
    const bankAccount = normalizeText(body?.accountNumber);
    const ifsc = normalizeText(body?.ifsc).toUpperCase();
    const upiId = normalizeText(body?.upiId).toLowerCase();

    if (holderName.length < 3 || holderName.length > 50) {
      return json({ success: false, error: "Account holder name must be between 3 and 50 characters." }, 400);
    }

    if (accountType !== "bank_account" && accountType !== "upi") {
      return json({ success: false, error: "Unsupported payout account type." }, 400);
    }

    if (accountType === "bank_account") {
      if (!/^[0-9]{9,18}$/.test(bankAccount)) {
        return json({ success: false, error: "Invalid bank account number." }, 400);
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return json({ success: false, error: "Invalid IFSC code." }, 400);
      }
    }

    if (accountType === "upi") {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,255}@[A-Za-z][A-Za-z0-9._-]{1,63}$/.test(upiId)) {
        return json({ success: false, error: "Invalid UPI ID." }, 400);
      }
    }

    const email = typeof profile.email === "string" ? profile.email.trim() : "";
    const phone = typeof profile.phone === "string" ? profile.phone.replace(/\D/g, "") : "";

    if (!email || phone.length < 10) {
      return json({ success: false, error: "Worker email and phone are required for payout setup." }, 400);
    }

    const contactResult = await razorpayJson(
      "https://api.razorpay.com/v1/contacts",
      keyId,
      keySecret,
      {
        name: holderName,
        email,
        contact: phone,
        type: "employee",
        reference_id: user.id,
      },
    );

    if (!contactResult.response.ok) {
      return json({ success: false, error: "RazorpayX could not create or locate the worker payout contact." }, 502);
    }

    const contactId = typeof contactResult.data?.id === "string" ? contactResult.data.id : "";
    if (!contactId) {
      return json({ success: false, error: "RazorpayX returned an invalid payout contact." }, 502);
    }

    const fundBody = accountType === "bank_account"
      ? {
          contact_id: contactId,
          account_type: "bank_account",
          bank_account: { name: holderName, ifsc, account_number: bankAccount },
        }
      : {
          contact_id: contactId,
          account_type: "vpa",
          vpa: { address: upiId },
        };

    const fundResult = await razorpayJson(
      "https://api.razorpay.com/v1/fund_accounts",
      keyId,
      keySecret,
      fundBody,
    );

    if (!fundResult.response.ok) {
      return json({ success: false, error: "RazorpayX could not create the payout fund account." }, 502);
    }

    const fundAccountId = typeof fundResult.data?.id === "string" ? fundResult.data.id : "";
    if (!fundAccountId) {
      return json({ success: false, error: "RazorpayX returned an invalid fund account." }, 502);
    }

    const bankName = typeof fundResult.data?.bank_account?.bank_name === "string"
      ? fundResult.data.bank_account.bank_name
      : null;
    const accountLast4 = accountType === "bank_account" ? bankAccount.slice(-4) : null;
    const upiIdMasked = accountType === "upi" ? maskUpi(upiId) : null;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("worker_payout_accounts")
      .select("*")
      .eq("worker_id", user.id)
      .eq("provider", "razorpayx")
      .eq("provider_fund_account_id", fundAccountId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return json({ success: true, account: safeAccountSummary(existing) });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("worker_payout_accounts")
      .insert({
        worker_id: user.id,
        provider: "razorpayx",
        provider_contact_id: contactId,
        provider_fund_account_id: fundAccountId,
        account_type: accountType,
        account_holder_name: holderName,
        bank_name: bankName,
        account_last4: accountLast4,
        upi_id_masked: upiIdMasked,
        status: "pending",
        is_default: false,
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    return json({ success: true, account: safeAccountSummary(inserted) });
  } catch (error) {
    console.error("[TempStaff] create-worker-payout-account failed:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to configure the payout account.",
    }, 500);
  }
});