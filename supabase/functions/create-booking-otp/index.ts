import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type OtpType =
  | 'start'
  | 'end'

type RequestBody = {
  bookingId?: unknown
  otpType?: unknown
  occurrenceId?: unknown
}

function getString(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const trimmed =
    value.trim()

  return trimmed || null
}

/*
 * Use the Web Crypto API instead of Math.random().
 *
 * OTPs are authentication credentials and should be generated
 * from a cryptographically secure random source.
 */
function generateOtp(): string {
  const random =
    new Uint32Array(1)

  crypto.getRandomValues(
    random,
  )

  const value =
    random[0] % 1_000_000

  return value
    .toString()
    .padStart(6, '0')
}

async function sha256(
  value: string,
): Promise<string> {
  const data =
    new TextEncoder().encode(
      value,
    )

  const hash =
    await crypto.subtle.digest(
      'SHA-256',
      data,
    )

  return Array.from(
    new Uint8Array(hash),
  )
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json',
      },
    },
  )
}

Deno.serve(
  async req => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          headers:
            corsHeaders,
        },
      )
    }

    try {
      const authorization =
        req.headers.get(
          'Authorization',
        )

      if (
        !authorization
      ) {
        return jsonResponse(
          {
            error:
              'Authentication required.',
          },
          401,
        )
      }

      const supabaseUrl =
        Deno.env.get(
          'SUPABASE_URL',
        )

      const serviceRoleKey =
        Deno.env.get(
          'SUPABASE_SERVICE_ROLE_KEY',
        )

      if (
        !supabaseUrl ||
        !serviceRoleKey
      ) {
        throw new Error(
          'Supabase service configuration is missing.',
        )
      }

      /*
       * Use the caller's Authorization header to resolve the
       * authenticated customer identity.
       */
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
          },
        )

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await userClient
          .auth
          .getUser()

      if (
        userError ||
        !user
      ) {
        return jsonResponse(
          {
            error:
              'Authentication required.',
          },
          401,
        )
      }

      const body =
        (await req.json()) as RequestBody

      const bookingId =
        getString(
          body.bookingId,
        )

      const otpTypeValue =
        getString(
          body.otpType,
        )

      const occurrenceId =
        getString(
          body.occurrenceId,
        )

      if (
        !bookingId
      ) {
        return jsonResponse(
          {
            error:
              'bookingId is required.',
          },
          400,
        )
      }

      if (
        otpTypeValue !==
          'start' &&
        otpTypeValue !==
          'end'
      ) {
        return jsonResponse(
          {
            error:
              'otpType must be start or end.',
          },
          400,
        )
      }

      const otpType =
        otpTypeValue as OtpType

      /*
       * Service-role client is used only after the caller has
       * been authenticated.
       */
      const supabase =
        createClient(
          supabaseUrl,
          serviceRoleKey,
        )

      const {
        data: booking,
        error:
          bookingError,
      } =
        await supabase
          .from('bookings')
          .select(
            `
              id,
              customer_id,
              worker_id,
              status,
              fulfillment_type
            `,
          )
          .eq(
            'id',
            bookingId,
          )
          .eq(
            'customer_id',
            user.id,
          )
          .maybeSingle()

      if (
        bookingError
      ) {
        throw bookingError
      }

      if (
        !booking
      ) {
        return jsonResponse(
          {
            error:
              'Booking not found.',
          },
          404,
        )
      }

      /*
       * Recurring bookings must bind the OTP to one specific
       * occurrence. This prevents an OTP generated for one shift
       * from being usable for another shift in the series.
       */
      if (
        booking.fulfillment_type ===
        'recurring'
      ) {
        if (
          !occurrenceId
        ) {
          return jsonResponse(
            {
              error:
                'occurrenceId is required for recurring bookings.',
            },
            400,
          )
        }

        const {
          data:
            occurrence,
          error:
            occurrenceError,
        } =
          await supabase
            .from(
              'booking_schedule_occurrences',
            )
            .select(
              `
                id,
                booking_id,
                worker_id,
                status,
                scheduled_start,
                scheduled_end
              `,
            )
            .eq(
              'id',
              occurrenceId,
            )
            .eq(
              'booking_id',
              bookingId,
            )
            .maybeSingle()

        if (
          occurrenceError
        ) {
          throw occurrenceError
        }

        if (
          !occurrence
        ) {
          return jsonResponse(
            {
              error:
                'Booking occurrence not found.',
            },
            404,
          )
        }

        if (
          booking.worker_id &&
          occurrence.worker_id &&
          booking.worker_id !==
            occurrence.worker_id
        ) {
          return jsonResponse(
            {
              error:
                'Booking occurrence worker assignment is invalid.',
            },
            409,
          )
        }

        /*
         * Start OTP is only meaningful after the worker arrives.
         * End OTP is only meaningful while the service is in progress.
         */
        if (
          otpType === 'start' &&
          occurrence.status !==
            'arrived'
        ) {
          return jsonResponse(
            {
              error:
                'Start OTP can only be generated after the worker has arrived.',
            },
            409,
          )
        }

        if (
          otpType === 'end' &&
          occurrence.status !==
            'in_progress'
        ) {
          return jsonResponse(
            {
              error:
                'End OTP can only be generated while the service is in progress.',
            },
            409,
          )
        }
      } else {
        /*
         * Non-recurring booking lifecycle.
         */
        if (
          otpType === 'start' &&
          booking.status !==
            'arrived'
        ) {
          return jsonResponse(
            {
              error:
                'Start OTP can only be generated after the worker has arrived.',
            },
            409,
          )
        }

        if (
          otpType === 'end' &&
          booking.status !==
            'in_progress'
        ) {
          return jsonResponse(
            {
              error:
                'End OTP can only be generated while the service is in progress.',
            },
            409,
          )
        }

        /*
         * A non-recurring OTP must never be associated with an
         * arbitrary occurrence.
         */
        if (
          occurrenceId
        ) {
          return jsonResponse(
            {
              error:
                'occurrenceId is only valid for recurring bookings.',
            },
            400,
          )
        }
      }

      const otp =
        generateOtp()

      const otpHash =
        await sha256(
          otp,
        )

      const expiresAt =
        new Date(
          Date.now() +
            15 *
              60 *
              1000,
        ).toISOString()

      /*
       * Only one pending OTP for this exact lifecycle target
       * should remain valid.
       */
      let expireQuery =
        supabase
          .from(
            'booking_otps',
          )
          .update({
            status:
              'expired',
          })
          .eq(
            'booking_id',
            bookingId,
          )
          .eq(
            'otp_type',
            otpType,
          )
          .eq(
            'status',
            'pending',
          )

      expireQuery =
        occurrenceId
          ? expireQuery.eq(
              'occurrence_id',
              occurrenceId,
            )
          : expireQuery.is(
              'occurrence_id',
              null,
            )

      const {
        error:
          expireError,
      } =
        await expireQuery

      if (
        expireError
      ) {
        throw expireError
      }

      const {
        error:
          insertError,
      } =
        await supabase
          .from(
            'booking_otps',
          )
          .insert({
            booking_id:
              bookingId,
            occurrence_id:
              occurrenceId ??
              null,
            otp_type:
              otpType,
            otp_hash:
              otpHash,
            status:
              'pending',
            attempts:
              0,
            expires_at:
              expiresAt,
          })

      if (
        insertError
      ) {
        throw insertError
      }

      const isDevelopment =
        Deno.env.get(
          'ENVIRONMENT',
        ) ===
        'development'

      /*
       * Development testing only.
       * Production responses must never contain the OTP.
       */
      if (
        isDevelopment
      ) {
        console.log(
          '[create-booking-otp] Generated development OTP metadata:',
          {
            bookingId,
            occurrenceId:
              occurrenceId ??
              null,
            otpType,
            expiresAt,
          },
        )
      }

      return jsonResponse(
        {
          success:
            true,
          message:
            'OTP generated successfully. Check your email or SMS.',
          expiresAt,
          occurrence_id:
            occurrenceId ??
            null,
          ...(isDevelopment
            ? {
                otp,
              }
            : {}),
        },
        200,
      )
    } catch (
      error
    ) {
      console.error(
        '[create-booking-otp]',
        error,
      )

      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Internal server error',
        },
        500,
      )
    }
  },
)