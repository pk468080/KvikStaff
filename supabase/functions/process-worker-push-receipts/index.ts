import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
const MAX_RECEIPTS_PER_REQUEST = 1000;
const MIN_RECEIPT_AGE_MS = 15 * 60 * 1000;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2, "0")).join("");
}
export default {
  fetch: withSupabase({
    auth: "secret"
  }, async (req, ctx)=>{
    if (req.method !== "POST") {
      return json({
        error: "Method not allowed"
      }, 405);
    }
    const now = Date.now();
    const receiptCutoff = new Date(now - MIN_RECEIPT_AGE_MS).toISOString();
    const expiryCutoff = new Date(now - RECEIPT_TTL_MS).toISOString();
    const { data: expiredRows, error: expiryError } = await ctx.supabaseAdmin.from("worker_push_deliveries").update({
      receipt_status: "expired",
      receipt_error: "No Expo receipt available within 24 hours.",
      receipt_checked_at: new Date().toISOString()
    }).eq("ticket_status", "ok").eq("receipt_status", "pending").lt("sent_at", expiryCutoff).select("id");
    if (expiryError) {
      console.error("Failed to expire stale push receipts:", expiryError);
      return json({
        error: "Unable to expire stale receipts"
      }, 500);
    }
    const { data: deliveries, error: deliveryError } = await ctx.supabaseAdmin.from("worker_push_deliveries").select("id, push_token_id, token_hash, expo_ticket_id").eq("ticket_status", "ok").eq("receipt_status", "pending").not("expo_ticket_id", "is", null).lte("sent_at", receiptCutoff).gte("sent_at", expiryCutoff).order("sent_at", {
      ascending: true
    }).limit(MAX_RECEIPTS_PER_REQUEST);
    if (deliveryError) {
      console.error("Failed to load pending push receipts:", deliveryError);
      return json({
        error: "Unable to load pending receipts"
      }, 500);
    }
    if (!deliveries || deliveries.length === 0) {
      return json({
        checked: 0,
        succeeded: 0,
        failed: 0,
        retired_tokens: 0,
        expired: expiredRows?.length ?? 0,
        reason: "No receipts ready to check"
      });
    }
    const rows = deliveries;
    const ids = rows.map((row)=>row.expo_ticket_id);
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        ids
      })
    });
    const expoBodyText = await expoResponse.text();
    let expoBody = expoBodyText;
    try {
      expoBody = JSON.parse(expoBodyText);
    } catch  {
    // Keep non-JSON response text for diagnostics.
    }
    if (!expoResponse.ok || expoBody?.errors) {
      console.error("Expo receipt lookup failed:", expoResponse.status, expoBodyText);
      return json({
        error: "Expo receipt lookup failed",
        status: expoResponse.status
      }, 502);
    }
    const receiptMap = expoBody?.data && typeof expoBody.data === "object" ? expoBody.data : null;
    if (!receiptMap) {
      return json({
        error: "Invalid Expo receipt response"
      }, 502);
    }
    const checkedAt = new Date().toISOString();
    const successfulIds = [];
    const errorRows = [];
    for (const delivery of rows){
      const receipt = receiptMap[delivery.expo_ticket_id];
      if (!receipt) {
        continue;
      }
      if (receipt.status === "ok") {
        successfulIds.push(delivery.id);
        continue;
      }
      if (receipt.status === "error") {
        const errorCode = String(receipt.details?.error ?? "UnknownExpoReceiptError");
        const errorMessage = receipt.message ? String(receipt.message) : null;
        errorRows.push({
          id: delivery.id,
          status: "error",
          error: errorCode,
          message: errorMessage,
          delivery
        });
      }
    }
    if (successfulIds.length > 0) {
      const { error: successError } = await ctx.supabaseAdmin.from("worker_push_deliveries").update({
        receipt_status: "ok",
        receipt_error: null,
        receipt_checked_at: checkedAt
      }).in("id", successfulIds);
      if (successError) {
        console.error("Failed to mark successful receipts:", successError);
        return json({
          error: "Unable to persist successful receipts"
        }, 500);
      }
    }
    let failed = 0;
    let retiredTokens = 0;
    for (const row of errorRows){
      const receiptError = row.message ? `${row.error}: ${row.message}` : row.error;
      const { error: updateError } = await ctx.supabaseAdmin.from("worker_push_deliveries").update({
        receipt_status: "error",
        receipt_error: receiptError,
        receipt_checked_at: checkedAt
      }).eq("id", row.id);
      if (updateError) {
        console.error("Failed to persist push receipt error:", updateError);
        continue;
      }
      failed += 1;
      if (row.error === "DeviceNotRegistered" && row.delivery.push_token_id) {
        const { data: tokenRow, error: tokenError } = await ctx.supabaseAdmin.from("push_tokens").select("id, token, is_active").eq("id", row.delivery.push_token_id).maybeSingle();
        if (tokenError) {
          console.error("Failed to load push token for retirement:", tokenError);
          continue;
        }
        if (tokenRow && tokenRow.is_active && await sha256Hex(tokenRow.token.trim()) === row.delivery.token_hash) {
          const { error: retireError } = await ctx.supabaseAdmin.from("push_tokens").update({
            is_active: false,
            updated_at: new Date().toISOString()
          }).eq("id", tokenRow.id);
          if (!retireError) {
            retiredTokens += 1;
          } else {
            console.error("Failed to retire DeviceNotRegistered token:", retireError);
          }
        }
      }
    }
    return json({
      checked: rows.length,
      succeeded: successfulIds.length,
      failed,
      retired_tokens: retiredTokens,
      expired: expiredRows?.length ?? 0,
      pending_without_receipt: rows.length - successfulIds.length - errorRows.length
    });
  })
};
