import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MIGRATION_MARKER = "kvikstaff_legacy_phone_migration";

const CONFIRMATION =
  "ROTATE_LEGACY_CUSTOMER_PASSWORDS_AND_MIGRATE_PHONE_IDENTITIES";

const PAGE_SIZE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-auth-migration-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AuthIdentity = {
  provider?: string | null;
  identity_data?: Record<string, unknown> | null;
};

type AuthUser = {
  id: string;
  phone?: string | null;
  phone_confirmed_at?: string | null;
  identities?: AuthIdentity[] | null;
  app_metadata?: Record<string, unknown> | null;
};

type Profile = {
  id: string;
  phone: string | null;
  role: string;
  is_active: boolean | null;
};

type PlanItem = {
  user: AuthUser;
  profile: Profile | null;
  phoneShape: string;
  normalizedPhone: string | null;
  action:
    | "normalize_phone_require_otp"
    | "rotate_password_and_flag_review";
  reason: string;
};

function json(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }

  return diff === 0;
}

function isIndianE164(value: string | null | undefined): boolean {
  return typeof value === "string" &&
    /^\+91[6-9]\d{9}$/.test(value.trim());
}

/**
 * Accept only common Indian mobile representations.
 * Return E.164 form only when the number is structurally valid.
 * This does not prove that the person owns the phone number.
 */
function normalizeIndianPhone(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (/^\+91[6-9]\d{9}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (/^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }

  if (/^0[6-9]\d{9}$/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }

  if (/^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }

  return null;
}

function phoneShape(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) {
    return "missing";
  }

  const trimmed = value.trim();
  if (isIndianE164(trimmed)) return "e164_india";

  const digits = trimmed.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return "10_digit_local";
  if (/^0[6-9]\d{9}$/.test(digits)) return "0_prefixed_local";
  if (/^91[6-9]\d{9}$/.test(digits)) return "91_prefixed_local";

  return "unrecognized";
}

function randomPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";

  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);

  return Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasPhoneIdentity(user: AuthUser): boolean {
  return Array.isArray(user.identities) &&
    user.identities.some((identity) => identity.provider === "phone");
}
async function hasPhoneIdentityWithFallback(
  admin: ReturnType<typeof createClient>,
  user: AuthUser,
): Promise<boolean> {
  // The paginated list can lack complete identity details.
  if (hasPhoneIdentity(user)) {
    return true;
  }

  if (!user.phone) {
    return false;
  }

  // Retrieve the full user record before classifying the account.
  const { data, error } = await admin.auth.admin.getUserById(user.id);

  if (error || !data?.user) {
    // Fail closed. Do not silently classify an unreadable identity.
    throw new Error(
      "Unable to verify a phone identity for an Auth user.",
    );
  }

  return hasPhoneIdentity(data.user as unknown as AuthUser);
}
function hasMigrationMarker(user: AuthUser): boolean {
  return Boolean(user.app_metadata?.[MIGRATION_MARKER]);
}

async function loadAuthUsers(
  admin: ReturnType<typeof createClient>,
): Promise<AuthUser[]> {
  const users: AuthUser[] = [];

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });

    if (error) {
      throw new Error("Unable to read Supabase Auth users.");
    }

    const batch = data.users as unknown as AuthUser[];
    users.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return users;
}

async function loadProfiles(
  admin: ReturnType<typeof createClient>,
): Promise<Profile[]> {
  const profiles: Profile[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, phone, role, is_active")
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      throw new Error("Unable to read customer profiles.");
    }

    const batch = (data ?? []) as Profile[];
    profiles.push(...batch);

    if (batch.length < PAGE_SIZE) break;
  }

  return profiles;
}

async function buildPlan(
  admin: ReturnType<typeof createClient>,
): Promise<{
  plans: PlanItem[];
  skipped: Record<string, number>;
}> {
  const [users, profiles] = await Promise.all([
    loadAuthUsers(admin),
    loadProfiles(admin),
  ]);

  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );

  // Include all Auth users in conflict detection, not only customers.
  const phoneOwners = new Map<string, Set<string>>();

  for (const user of users) {
  if (!user.phone) {
    skip("missing_auth_phone");
    continue;
  }

  if (!(await hasPhoneIdentityWithFallback(admin, user))) {
    skip("not_a_phone_identity");
    continue;
  }

    const owners = phoneOwners.get(normalized) ?? new Set<string>();
    owners.add(user.id);
    phoneOwners.set(normalized, owners);
  }

  const skipped: Record<string, number> = {};
  const skip = (key: string) => {
    skipped[key] = (skipped[key] ?? 0) + 1;
  };

  const plans: PlanItem[] = [];

  for (const user of users) {
    if (!user.phone || !hasPhoneIdentity(user)) {
      skip("not_a_phone_identity");
      continue;
    }

    if (hasMigrationMarker(user)) {
      skip("already_migrated_or_flagged");
      continue;
    }

    const profile = profilesById.get(user.id) ?? null;

    // Do not change worker/admin identities through this migration.
    if (profile && profile.role !== "customer") {
      skip("non_customer_profile");
      continue;
    }

    // This function is scoped to the known legacy, non-E.164 identities.
    if (isIndianE164(user.phone)) {
      skip("already_e164");
      continue;
    }

    const normalizedPhone = normalizeIndianPhone(user.phone);
    let reason: string | null = null;

    if (!normalizedPhone) {
      reason = "invalid_auth_phone_requires_manual_review";
    } else if (profile && !normalizeIndianPhone(profile.phone)) {
      reason = "invalid_profile_phone_requires_manual_review";
    } else if (
      profile &&
      normalizeIndianPhone(profile.phone) !== normalizedPhone
    ) {
      reason = "auth_and_profile_phone_mismatch";
    } else if (profile?.is_active === false) {
      reason = "inactive_customer_profile_requires_manual_review";
    } else {
      const owners = phoneOwners.get(normalizedPhone);
      if (owners && owners.size > 1) {
        reason = "duplicate_normalized_phone_requires_manual_review";
      }
    }

    plans.push({
      user,
      profile,
      phoneShape: phoneShape(user.phone),
      normalizedPhone,
      action: reason
        ? "rotate_password_and_flag_review"
        : "normalize_phone_require_otp",
      reason: reason ??
        (profile
          ? "valid_phone_matches_customer_profile"
          : "valid_phone_without_profile"),
    });
  }

  return { plans, skipped };
}

async function fingerprintPlan(plans: PlanItem[]): Promise<string> {
  // Phone values are included internally so even a phone change between
  // dry-run and apply invalidates the fingerprint. They are never returned.
  const canonical = plans
    .map((plan) => ({
      id: plan.user.id,
      phone: plan.user.phone ?? null,
      normalizedPhone: plan.normalizedPhone,
      role: plan.profile?.role ?? "no_profile",
      action: plan.action,
      reason: plan.reason,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return await sha256(JSON.stringify(canonical));
}

function publicPlan(plans: PlanItem[]) {
  return plans.map((plan) => ({
    user_id: plan.user.id,
    profile_role: plan.profile?.role ?? "no_profile",
    phone_shape: plan.phoneShape,
    action: plan.action,
    reason: plan.reason,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  const configuredSecret = Deno.env.get("AUTH_MIGRATION_SECRET");

  if (!configuredSecret || configuredSecret.length < 64) {
    return json({
      success: false,
      error: "Migration endpoint is not configured.",
    }, 503);
  }

  const suppliedSecret = req.headers.get("x-auth-migration-secret") ?? "";

  if (!constantTimeEqual(configuredSecret, suppliedSecret)) {
    return json({ success: false, error: "Unauthorized." }, 401);
  }

  let body: Record<string, unknown>;

  try {
    const raw = await req.text();

    if (raw.length > 8192) {
      return json({ success: false, error: "Request too large." }, 413);
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ success: false, error: "Invalid JSON object." }, 400);
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return json({ success: false, error: "Invalid JSON request." }, 400);
  }

  if (body.mode !== "dry_run" && body.mode !== "apply") {
    return json({
      success: false,
      error: 'Use mode "dry_run" or "apply".',
    }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({
        success: false,
        error: "Server-side Supabase configuration is missing.",
      }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { plans, skipped } = await buildPlan(admin);
    const planFingerprint = await fingerprintPlan(plans);
    const reviewCount = plans.filter(
      (plan) => plan.action === "rotate_password_and_flag_review",
    ).length;

    const summary = {
      target_count: plans.length,
      review_required_count: reviewCount,
      skipped,
      plan_fingerprint: planFingerprint,
      entries: publicPlan(plans),
    };

    if (body.mode === "dry_run") {
      return json({
        success: true,
        mode: "dry_run",
        read_only: true,
        ...summary,
      });
    }

    // Applying is deliberately gated by a phrase and the exact plan
    // fingerprint returned by the dry run.
    if (
      body.confirm !== CONFIRMATION ||
      body.expected_plan_fingerprint !== planFingerprint
    ) {
      return json({
        success: false,
        error:
          "Confirmation or plan fingerprint did not match. No changes were made.",
        mode: "apply",
        ...summary,
      }, 409);
    }

    // A malformed, conflicting, or mismatched number may require customer
    // support. Block by default; explicitly acknowledge those accounts to
    // proceed with password rotation and phone unconfirmation only.
    if (reviewCount > 0 && body.allow_review_accounts !== true) {
      return json({
        success: false,
        error:
          "Review-required accounts exist. No changes were made. Resolve them first, or explicitly set allow_review_accounts:true after reviewing the impact.",
        mode: "apply",
        ...summary,
      }, 409);
    }

    const results: Record<string, unknown>[] = [];

    // Sequential updates make failures easier to isolate.
    // Stop at the first API failure rather than cascading further writes.
    for (const plan of plans) {
      const changedAt = new Date().toISOString();
      const reviewOnly =
        plan.action === "rotate_password_and_flag_review";

      const appMetadata = {
        ...(plan.user.app_metadata ?? {}),
        [MIGRATION_MARKER]: {
          version: 1,
          status: reviewOnly
            ? "password_rotated_phone_review_required"
            : "phone_normalized_unconfirmed",
          changed_at: changedAt,
          reason: plan.reason,
        },
      };

      const attributes: {
        password: string;
        phone_confirm: boolean;
        phone?: string;
        app_metadata: Record<string, unknown>;
      } = {
        password: randomPassword(),
        // Old accounts were falsely confirmed by the legacy fixed-OTP flow.
        // Never claim a phone number is verified during this migration.
        phone_confirm: false,
        app_metadata: appMetadata,
      };

      if (!reviewOnly && plan.normalizedPhone) {
        attributes.phone = plan.normalizedPhone;
      }

      const { data, error } = await admin.auth.admin.updateUserById(
        plan.user.id,
        attributes,
      );

      if (error || !data?.user) {
        results.push({
          user_id: plan.user.id,
          status: "update_failed",
          error:
            "Auth Admin update failed. Inspect the account and rerun dry_run before retrying.",
        });
        break;
      }

           // Read the user again because the Admin update response may not
      // contain the refreshed identity metadata.
      const {
        data: verificationData,
        error: verificationError,
      } = await admin.auth.admin.getUserById(plan.user.id);

      if (verificationError || !verificationData?.user) {
        results.push({
          user_id: plan.user.id,
          status: "updated_but_verify_manually",
          reason: "admin_update_succeeded_but_readback_failed",
        });
        break;
      }

      const updated = verificationData.user as unknown as AuthUser;

      const phoneIdentity = updated.identities?.find(
        (identity) => identity.provider === "phone",
      );

      const phoneIdentityMatches = Boolean(
        plan.normalizedPhone &&
          phoneIdentity?.identity_data?.phone === plan.normalizedPhone,
      );

      const identityMarkedUnverified =
        phoneIdentity?.identity_data?.phone_verified === false;

      let status: string;

      if (reviewOnly) {
        status = "password_rotated_phone_review_required";
      } else if (
        updated.phone === plan.normalizedPhone &&
        phoneIdentityMatches &&
        identityMarkedUnverified
      ) {
        status = updated.phone_confirmed_at
          ? "phone_normalized_otp_login_required_legacy_confirmation_timestamp_retained"
          : "phone_normalized_otp_login_required";
      } else {
        status = "updated_but_verify_manually";
      }

      results.push({
        user_id: plan.user.id,
        status,
        reason: plan.reason,
      });
    }

      const manualReviewCount = results.filter(
      (result) =>
        result.status === "password_rotated_phone_review_required" ||
        result.status === "updated_but_verify_manually" ||
        result.status === "update_failed",
    ).length;

    const retainedLegacyConfirmationCount = results.filter(
      (result) =>
        result.status ===
        "phone_normalized_otp_login_required_legacy_confirmation_timestamp_retained",
    ).length;

   return json({
  success: results.length === plans.length && manualReviewCount === 0,
  mode: "apply",
  completed_count: results.length,
  manual_review_or_failure_count: manualReviewCount,
  legacy_confirmation_timestamp_retained_count:
    retainedLegacyConfirmationCount,
  results,
}, manualReviewCount > 0 ? 207 : 200);
  } catch {
    return json({
      success: false,
      error:
        "Migration operation failed. Inspect the current state with dry_run before trying again.",
    }, 500);
  }
});