import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { processAccountDeletionApproval } from "./account-deletion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

const ALLOWED_ACTIONS = new Set([
  "admin_assign_booking_worker",
  "admin_cancel_booking",
  "admin_create_notification",
  "admin_moderate_review",
  "admin_remove_worker",
  "admin_review_account_deletion",
  "admin_review_worker_application",
  "admin_review_worker_document",
  "admin_set_customer_active",
  "admin_set_service_active",
  "admin_set_worker_status",
  "admin_update_worker",
  "admin_upsert_service",
  "admin_upsert_service_area",
  "admin_upsert_service_area_v2",
  "admin_upsert_service_price",
  "admin_upsert_service_variant",
  "get_eligible_workers",
  "write_admin_audit",
    "admin_list_service_areas_v3",
  "admin_upsert_service_area_v3",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    const authorization =
      req.headers.get("Authorization");

    if (!authorization) {
      return json(
        {
          success: false,
          error: "Authentication required.",
        },
        401,
      );
    }

    const url =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    if (!url || !serviceRoleKey) {
      throw new Error(
        "Supabase server configuration is missing.",
      );
    }

    const adminClient =
      createClient(
        url,
        serviceRoleKey,
      );

    const userClient =
      createClient(
        url,
        serviceRoleKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },
        },
      );

    const {
      data: { user },
      error: userError,
    } =
      await userClient.auth.getUser();

    if (userError || !user) {
      return json(
        {
          success: false,
          error: "Invalid authentication.",
        },
        401,
      );
    }

    const {
      data: profile,
      error: profileError,
    } =
      await adminClient
        .from("profiles")
        .select(
          "id, role, is_active",
        )
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (
      !profile ||
      profile.role !== "admin" ||
      profile.is_active !== true
    ) {
      return json(
        {
          success: false,
          error:
            "Administrator access required.",
        },
        403,
      );
    }

    const body = await req.json();

    const action =
      typeof body?.action === "string"
        ? body.action
        : "";

    const params =
      body?.params &&
      typeof body.params === "object" &&
      !Array.isArray(body.params)
        ? body.params
        : {};

    if (!ALLOWED_ACTIONS.has(action)) {
      return json(
        {
          success: false,
          error:
            "Unsupported admin action.",
        },
        400,
      );
    }

    // Customer approval must complete the erasure workflow, not just deactivate the
    // profile. Worker requests continue through the existing reviewed worker flow.
    if (
      action === "admin_review_account_deletion" &&
      params.p_status === "approved"
    ) {
      const requestId =
        typeof params.p_request_id === "string"
          ? params.p_request_id
          : "";

      if (!requestId) {
        return json(
          {
            success: false,
            error: "Deletion request ID is required.",
          },
          400,
        );
      }

      const flow = await processAccountDeletionApproval(
        requestId,
        {
          prepare: async (id) => {
            const { data, error } = await userClient.rpc(
              "prepare_customer_account_deletion",
              { p_request_id: id },
            );
            return { data, error };
          },

          findAuthUser: async (id) => {
            const { data, error } = await adminClient.auth.admin.getUserById(id);

            if (error) {
              const authError = error as {
                status?: number;
                code?: string;
                message?: string;
              };

              if (
                authError.status === 404 ||
                authError.code === "user_not_found"
              ) {
                return { found: false, notFound: true };
              }

              return { found: false, error: authError };
            }

            return data.user
              ? { found: true }
              : { found: false, notFound: true };
          },

          deleteAuthUser: async (id) => {
            const { error } = await adminClient.auth.admin.deleteUser(id);
            return { error };
          },

          banAuthUser: async (id) => {
            const { error } = await adminClient.auth.admin.updateUserById(id, {
              ban_duration: "876000h",
            });
            return { error };
          },

          complete: async (id, targetAuthUserId, targetProfileId) => {
            const { data, error } = await userClient.rpc(
              "complete_customer_account_deletion",
              {
                p_request_id: id,
                p_auth_user_id: targetAuthUserId,
                p_profile_id: targetProfileId,
              },
            );
            return { data, error };
          },
        },
      );

      if (flow.kind === "failure") {
        return json(
          { success: false, error: flow.error },
          flow.status,
        );
      }

      if (flow.kind === "success") {
        return json({ success: true, data: flow.data });
      }

      // Not a customer erasure: keep the existing worker-deactivation RPC below.
    }

    const {
      data,
      error,
    } = await userClient.rpc(
      action,
      params,
    );

    if (error) {
      console.error(
        `[KvikStaff] admin-action ${action}:`,
        error,
      );

      return json(
        {
          success: false,
          error: error.message,
        },
        400,
      );
    }

    return json({
      success: true,
      data: data ?? null,
    });
  } catch (error) {
    console.error(
      "[KvikStaff] admin-action error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500,
    );
  }
});