import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
const MAX_EXPO_BATCH_SIZE = 100;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
function isExpoToken(token) {
  return typeof token === "string" && /^ExponentPushToken\[[^\]]+\]$/.test(token.trim());
}
function chunk(items, size) {
  const result = [];
  for(let i = 0; i < items.length; i += size){
    result.push(items.slice(i, i + size));
  }
  return result;
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
    let payload;
    try {
      payload = await req.json();
    } catch  {
      return json({
        error: "Invalid JSON body"
      }, 400);
    }
    if (payload?.type !== "INSERT" || payload?.table !== "notifications" || payload?.schema !== "public") {
      return json({
        ignored: true
      });
    }
    const record = payload?.record;
    const notificationId = String(record?.id ?? "").trim();
    const userId = String(record?.user_id ?? "").trim();
    const title = String(record?.title ?? "").trim();
    const body = String(record?.message ?? "").trim();
    if (!notificationId || !userId || !title || !body) {
      return json({
        error: "Notification record is incomplete"
      }, 400);
    }
    const { data: pushTokens, error: pushTokenError } = await ctx.supabaseAdmin.from("push_tokens").select("id, token").eq("user_id", userId).eq("is_active", true);
    if (pushTokenError) {
      console.error("Failed to load push_tokens:", pushTokenError);
      return json({
        error: "Unable to load push token"
      }, 500);
    }
    const tokenRows = [];
    for (const row of pushTokens ?? []){
      if (isExpoToken(row?.token) && row?.id) {
        tokenRows.push({
          id: row.id,
          token: row.token.trim()
        });
      }
    }
    const deduped = new Map();
    for (const row of tokenRows){
      deduped.set(row.token, row);
    }
    const tokens = Array.from(deduped.values());
    if (tokens.length === 0) {
      return json({
        sent: 0,
        batches: 0,
        retired_tokens: 0,
        recorded_deliveries: 0,
        reason: "No active Expo push tokens"
      });
    }
    const retiredTokens = new Set();
    let sent = 0;
    let recordedDeliveries = 0;
    const batchResults = [];
    for (const tokenBatch of chunk(tokens, MAX_EXPO_BATCH_SIZE)){
      const messages = tokenBatch.map(({ token: to })=>({
          to,
          sound: "default",
          title,
          body,
          data: {
            notification_id: notificationId,
            booking_id: record.booking_id ?? null,
            offer_id: record.booking_worker_offer_id ?? null,
            notification_type: record.notification_type ?? "general"
          },
          channelId: "booking-assignment"
        }));
      const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(messages)
      });
      const expoBodyText = await expoResponse.text();
      let expoBody = expoBodyText;
      try {
        expoBody = JSON.parse(expoBodyText);
      } catch  {
      // Keep non-JSON response text for diagnostics.
      }
      if (!expoResponse.ok) {
        console.error("Expo push send failed:", expoResponse.status, expoBodyText);
        return json({
          error: "Push delivery failed",
          status: expoResponse.status,
          sent_before_failure: sent
        }, 502);
      }
      const tickets = Array.isArray(expoBody?.data) ? expoBody.data : [];
      if (tickets.length !== tokenBatch.length) {
        console.error("Expo ticket count mismatch:", tickets.length, tokenBatch.length);
        return json({
          error: "Invalid Expo push response",
          sent_before_failure: sent
        }, 502);
      }
      const now = new Date().toISOString();
      const deliveryRows = [];
      for(let i = 0; i < tokenBatch.length; i += 1){
        const tokenRow = tokenBatch[i];
        const ticket = tickets[i];
        if (ticket?.status === "ok" && typeof ticket?.id === "string" && ticket.id.trim()) {
          deliveryRows.push({
            notification_id: notificationId,
            user_id: userId,
            push_token_id: tokenRow.id,
            token_hash: await sha256Hex(tokenRow.token),
            expo_ticket_id: ticket.id.trim(),
            ticket_status: "ok",
            ticket_error: null,
            receipt_status: "pending",
            receipt_error: null,
            sent_at: now
          });
          continue;
        }
        const ticketError = ticket?.details?.error || ticket?.message || "Expo returned an invalid push ticket.";
        deliveryRows.push({
          notification_id: notificationId,
          user_id: userId,
          push_token_id: tokenRow.id,
          token_hash: await sha256Hex(tokenRow.token),
          expo_ticket_id: null,
          ticket_status: "error",
          ticket_error: String(ticketError),
          receipt_status: "not_applicable",
          receipt_error: null,
          sent_at: now
        });
        if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
          retiredTokens.add(tokenRow.token);
        }
      }
      const { error: deliveryError } = await ctx.supabaseAdmin.from("worker_push_deliveries").upsert(deliveryRows, {
        onConflict: "notification_id,push_token_id",
        ignoreDuplicates: true
      });
      if (deliveryError) {
        console.error("Failed to record push deliveries:", deliveryError);
        return json({
          error: "Push delivery audit persistence failed",
          sent_before_failure: sent
        }, 500);
      }
      sent += messages.length;
      recordedDeliveries += deliveryRows.length;
      batchResults.push(expoBody);
    }
    if (retiredTokens.size > 0) {
      const { error: retireError } = await ctx.supabaseAdmin.from("push_tokens").update({
        is_active: false,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId).in("token", Array.from(retiredTokens));
      if (retireError) {
        console.error("Failed to retire invalid Expo push tokens:", retireError);
      }
    }
    return json({
      sent,
      batches: Math.ceil(tokens.length / MAX_EXPO_BATCH_SIZE),
      retired_tokens: retiredTokens.size,
      recorded_deliveries: recordedDeliveries,
      expo: batchResults.length === 1 ? batchResults[0] : batchResults
    });
  })
};
