import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      throw new Error(
        "Supabase server configuration is missing."
      );
    }

    /*
     * Client using the caller's JWT.
     * This lets us identify the logged-in admin.
     */
    const userClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    );

    const {
      data: {
        user,
      },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid authentication.",
        },
        401
      );
    }

    /*
     * Service-role client for protected server operations.
     */
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    /*
     * Only administrators can create workers.
     */
    const {
      data: adminProfile,
      error: adminProfileError,
    } = await adminClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (adminProfileError) {
      throw adminProfileError;
    }

    if (
      !adminProfile ||
      adminProfile.role !== "admin" ||
      adminProfile.is_active !== true
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Administrator access required.",
        },
        403
      );
    }

    const body = await req.json();

    const fullName =
      typeof body?.fullName === "string"
        ? body.fullName.trim()
        : "";

    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const phone =
      typeof body?.phone === "string"
        ? body.phone.trim()
        : "";

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    const serviceIds = Array.isArray(
      body?.serviceIds
    )
      ? body.serviceIds.filter(
          (value: unknown): value is string =>
            typeof value === "string"
        )
      : [];

    const isFeatured =
      body?.featured === true ||
      body?.featured === "true";

    if (!fullName) {
      return jsonResponse(
        {
          success: false,
          error: "Full name is required.",
        },
        400
      );
    }

    if (!email) {
      return jsonResponse(
        {
          success: false,
          error: "Email is required.",
        },
        400
      );
    }

    if (!password || password.length < 8) {
      return jsonResponse(
        {
          success: false,
          error:
            "Password must contain at least 8 characters.",
        },
        400
      );
    }

    if (serviceIds.length === 0) {
      return jsonResponse(
        {
          success: false,
          error:
            "Select at least one service.",
        },
        400
      );
    }

    /*
     * Make sure the requested services actually exist
     * and are active.
     */
    const {
      data: services,
      error: servicesError,
    } = await adminClient
      .from("services")
      .select("id, name")
      .in("id", serviceIds)
      .eq("is_active", true);

    if (servicesError) {
      throw servicesError;
    }

    if (
      !services ||
      services.length !==
        new Set(serviceIds).size
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "One or more selected services are invalid.",
        },
        400
      );
    }

    /*
     * Create the worker Auth account.
     *
     * email_confirm=true means the admin-created
     * worker does not need an email verification step
     * before first login.
     */
    const {
      data: createdUser,
      error: createUserError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone,
        role: "worker",
      },
    });

    if (createUserError) {
      return jsonResponse(
        {
          success: false,
          error: createUserError.message,
        },
        400
      );
    }

    const workerId =
      createdUser.user?.id;

    if (!workerId) {
      throw new Error(
        "Worker account was created without a user ID."
      );
    }

    /*
     * Create the application profile.
     */
    const {
      error: profileError,
    } = await adminClient
      .from("profiles")
      .insert({
        id: workerId,
        full_name: fullName,
        phone: phone || null,
        email,
        role: "worker",
        is_active: true,
      });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(
        workerId
      );

      throw profileError;
    }

    /*
     * Create the worker-specific profile.
     */
    const {
      error: workerProfileError,
    } = await adminClient
      .from("worker_profiles")
      .insert({
        id: workerId,
        worker_status: "offline",
        service_radius_km: 10,
        is_verified: false,
        is_featured: isFeatured,
        rating: 0,
        total_completed_jobs: 0,
      });

    if (workerProfileError) {
      await adminClient
        .from("profiles")
        .delete()
        .eq("id", workerId);

      await adminClient.auth.admin.deleteUser(
        workerId
      );

      throw workerProfileError;
    }

    /*
     * Attach the worker to the selected services.
     */
    const workerServices =
      serviceIds.map(
        (serviceId: string) => ({
          worker_id: workerId,
          service_id: serviceId,
        })
      );

    const {
      error: workerServicesError,
    } = await adminClient
      .from("worker_services")
      .insert(workerServices);

    if (workerServicesError) {
      await adminClient
        .from("worker_profiles")
        .delete()
        .eq("id", workerId);

      await adminClient
        .from("profiles")
        .delete()
        .eq("id", workerId);

      await adminClient.auth.admin.deleteUser(
        workerId
      );

      throw workerServicesError;
    }

    return jsonResponse({
      success: true,
      worker: {
        id: workerId,
        fullName,
        email,
        phone: phone || null,
        workerStatus: "offline",
        isVerified: false,
        serviceIds,
      },
    });
  } catch (error) {
    console.error(
      "[TempStaff] create-worker error:",
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