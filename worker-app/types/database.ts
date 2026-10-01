// worker-app/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole =
  | 'customer'
  | 'worker'
  | 'admin'

export type WorkerStatus =
  | 'offline'
  | 'available'
  | 'busy'
  | 'suspended'

export type WorkerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_required'
  | 'approved'
  | 'rejected'

export type WorkerDocumentType =
  | 'aadhaar'
  | 'pan'
  | 'passport_photo'
  | 'address_proof'
  | 'police_verification'
  | 'bank_account'

export type WorkerDocumentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'

export type BookingStatus =
  | 'pending_payment'
  | 'paid'
  | 'searching_worker'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'payment_failed'

export type BookingFulfillmentType =
  | 'instant'
  | 'scheduled'
  | 'recurring'

export type BookingDurationUnit =
  | 'day'
  | 'week'
  | 'month'
  | 'hour'

export type BookingWorkerOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled'

export type TableDefinition<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<{
        id: string
        full_name: string | null
        phone: string | null
        email: string | null
        role: UserRole
        avatar_url: string | null
        is_active: boolean
        created_at: string
        updated_at: string
        company_name: string | null
      }>

      services: TableDefinition<{
        id: string
        name: string
        description: string | null
        is_active: boolean
        created_at: string
        updated_at: string
      }>

      service_variants: TableDefinition<{
        id: string
        service_id: string
        name: string
        description: string | null
        billing_type: string
        duration_value: number | null
        duration_unit: string | null
        min_quantity: number
        max_quantity: number | null
        is_active: boolean
        sort_order: number
        created_at: string
        updated_at: string
      }>

      addresses: TableDefinition<{
        id: string
        user_id: string
        label: string | null
        address_line: string
        latitude: number
        longitude: number
        location: unknown
        created_at: string
      }>

      worker_profiles: TableDefinition<{
        id: string
        worker_status: WorkerStatus
        service_radius_km: number
        current_location: unknown
        is_verified: boolean
        rating: number
        total_completed_jobs: number
        created_at: string
        updated_at: string
        is_featured: boolean
      }>

      worker_services: TableDefinition<{
        worker_id: string
        service_id: string
        created_at: string
      }>

      worker_availability: TableDefinition<{
        id: string
        worker_id: string
        available_from: string
        available_until: string
        is_available: boolean
        created_at: string
      }>

      worker_weekly_schedules: TableDefinition<{
        id: string
        worker_id: string
        day_of_week: number
        start_time: string
        end_time: string
        is_active: boolean
        created_at: string
        updated_at: string
      }>

      worker_schedule_exceptions: TableDefinition<{
        id: string
        worker_id: string
        exception_date: string
        exception_type: 'unavailable' | 'available'
        start_time: string | null
        end_time: string | null
        reason: string | null
        is_active: boolean
        created_at: string
        updated_at: string
      }>

      worker_schedule_settings: TableDefinition<{
        worker_id: string
        timezone: string
        slot_interval_minutes: number | null
        created_at: string
        updated_at: string
      }>

      worker_onboarding_profiles: TableDefinition<{
        worker_id: string
        date_of_birth: string | null
        gender: string | null
        current_address: string | null
        permanent_address: string | null
        city: string | null
        state: string | null
        pincode: string | null
        experience_years: number | null
        experience_summary: string | null
        profile_photo_path: string | null
        service_latitude: number | null
        service_longitude: number | null
        onboarding_step: number
        consent_at: string | null
        created_at: string
        updated_at: string
      }>

    worker_applications: TableDefinition<{
  id: string
  worker_id: string
  onboarding_type:
    | 'self_registered'
    | 'admin_created'
  status: WorkerApplicationStatus
        submitted_at: string | null
        reviewed_at: string | null
        reviewed_by: string | null
        review_notes: string | null
        reapply_after: string | null
        created_at: string
        updated_at: string
      }>

      worker_documents: TableDefinition<{
        id: string
        application_id: string
        worker_id: string
        document_type: WorkerDocumentType
        file_path: string
        file_name: string | null
        mime_type: string | null
        file_size: number | null
        status: WorkerDocumentStatus
        rejection_reason: string | null
        reviewed_at: string | null
        reviewed_by: string | null
        created_at: string
        updated_at: string
      }>

      bookings: TableDefinition<{
        id: string
        customer_id: string
        worker_id: string | null
        service_id: string
        address_id: string

        status: BookingStatus

        duration_value: number
        duration_unit: BookingDurationUnit

        scheduled_start: string
        scheduled_end: string

        base_amount: number
        platform_fee: number
        tax_amount: number
        total_amount: number

        notes: string | null

        created_at: string
        updated_at: string

        fulfillment_type: BookingFulfillmentType
        worker_accepted_at: string | null

        service_variant_id: string

        schedule_start_date: string | null
        schedule_end_date: string | null
        daily_start_time: string | null
        daily_end_time: string | null

        selected_weekdays: number[] | null
        off_dates: string[] | null

        total_working_hours: number | null

        pricing_snapshot: Json | null

        journey_started_at: string | null
        journey_started_by: string | null

        arrived_at: string | null

        started_at: string | null
        started_by: string | null
        start_otp_verified_at: string | null

        completed_at: string | null
        end_otp_verified_at: string | null
      }>

      booking_schedule_occurrences: TableDefinition<{
        id: string
        booking_id: string
        worker_id: string | null

        occurrence_index: number
        occurrence_date: string

        scheduled_start: string
        scheduled_end: string

        status: string

        created_at: string
        updated_at: string

        base_amount: number
        discount_amount: number
        platform_fee: number
        tax_amount: number
        total_amount: number

        pricing_snapshot: Json

        journey_started_at: string | null
        arrived_at: string | null
        started_at: string | null
        start_otp_verified_at: string | null
        completed_at: string | null
        end_otp_verified_at: string | null

        original_occurrence_date: string | null

        last_modified_at: string | null
        last_modified_by: string | null
      }>

      booking_worker_offers: TableDefinition<{
        id: string
        booking_id: string
        worker_id: string
        status: BookingWorkerOfferStatus
        offered_at: string
        expires_at: string
        responded_at: string | null
        created_at: string
        updated_at: string
      }>

      worker_earnings: TableDefinition<{
        id: string
        worker_id: string
        booking_id: string
        gross_amount: number
        platform_fee: number
        net_amount: number
        created_at: string
      }>

      notifications: TableDefinition<{
        id: string
        user_id: string
        booking_id: string | null
        title: string
        message: string
        notification_type: string | null
        is_read: boolean
        created_at: string
      }>

      conversations: TableDefinition<{
        id: string
        booking_id: string
        customer_id: string
        worker_id: string
        occurrence_id: string | null
        status: 'active' | 'closed'
        created_at: string
        updated_at: string
        last_message_at: string | null
      }>

      messages: TableDefinition<{
        id: string
        conversation_id: string
        sender_id: string
        sender_role: 'customer' | 'worker' | 'system'
        message_type: 'text' | 'system'
        body: string
        created_at: string
        edited_at: string | null
        deleted_at: string | null
      }>

      push_tokens: TableDefinition<{
        id: string
        user_id: string
        token: string
        platform: string | null
        is_active: boolean
        created_at: string
        updated_at: string
      }>

      worker_locations: TableDefinition<{
        id: number
        worker_id: string
        booking_id: string | null
        latitude: number
        longitude: number
        location: unknown
        recorded_at: string
      }>

      worker_presence: TableDefinition<{
        worker_id: string
        is_available: boolean
        last_seen_at: string | null
        expires_at: string | null
        updated_at: string
      }>

      support_tickets: TableDefinition<{
        id: string
        user_id: string
        category: string
        subject: string
        description: string
        booking_id: string | null
        payment_id: string | null
        worker_id: string | null
        refund_request_id: string | null
        payment_refund_id: string | null
        status: string
        admin_notes: string | null
        resolved_at: string | null
        created_at: string
        updated_at: string
      }>
    }

    Views: {}

    Functions: {
        register_worker_push_token: {
    Args: {
      p_token: string
      p_platform?: string | null
    }
    Returns: {
      id: string
      user_id: string
      token: string
      platform: string | null
      is_active: boolean
      created_at: string
      updated_at: string
    }
  }
    worker_get_booking_context: {
    Args: {
      p_booking_id: string
    }
    Returns: Json
  }
    mark_notification_read: {
    Args: {
      p_notification_id: string
    }
    Returns: Json
  }
  worker_booking_action: {
    Args: {
      p_booking_id: string
      p_action: string
    }
    Returns: Json
  }

  worker_occurrence_action: {
    Args: {
      p_occurrence_id: string
      p_action: string
    }
    Returns: Json
  }

  verify_booking_otp_atomic: {
    Args: {
      p_booking_id: string
      p_otp_type: string
      p_otp_hash: string
    }
    Returns: Json
  }

  verify_booking_occurrence_otp_atomic: {
    Args: {
      p_occurrence_id: string
      p_otp_type: string
      p_otp_hash: string
    }
    Returns: Json
  }

  worker_respond_to_offer: {
    Args: {
      p_offer_id: string
      p_response: string
    }
    Returns: Json
  }

  worker_set_presence: {
    Args: {
      p_available: boolean
    }
    Returns: Json
  }

  worker_presence_heartbeat: {
    Args: {
      p_latitude: number
      p_longitude: number
    }
    Returns: Json
  }

  worker_update_location: {
    Args: {
      p_latitude: number
      p_longitude: number
      p_booking_id: string | null
    }
    Returns: Json
  }

  record_worker_booking_location: {
    Args: {
      p_booking_id: string
      p_latitude: number
      p_longitude: number
    }
    Returns: Json
  }

  save_worker_onboarding: {
    Args: {
      p_date_of_birth?: string | null
      p_gender?: string | null
      p_current_address?: string | null
      p_permanent_address?: string | null
      p_city?: string | null
      p_state?: string | null
      p_pincode?: string | null
      p_experience_years?: number | null
      p_experience_summary?: string | null
      p_profile_photo_path?: string | null
      p_service_latitude?: number | null
      p_service_longitude?: number | null
      p_onboarding_step?: number
    }
    Returns: Json
  }

  set_worker_onboarding_consent: {
    Args: {}
    Returns: Json
  }

  submit_worker_application: {
    Args: {}
    Returns: Json
  }

  save_worker_document: {
    Args: {
      p_document_type: string
      p_file_path: string
      p_file_name: string | null
      p_mime_type: string | null
      p_file_size: number | null
    }
    Returns: Json
  }

  set_worker_services: {
    Args: {
      p_service_ids: string[]
    }
    Returns: Json
  }

  create_worker_support_ticket: {
    Args: {
      p_category: string
      p_subject: string
      p_description: string
      p_booking_id?: string | null
    }
    Returns: Json
  }

  worker_report_booking_incident: {
    Args: {
      p_booking_id: string
      p_incident_type: string
      p_description: string
      p_occurrence_id?: string | null
    }
    Returns: Json
  }

  worker_list_booking_incidents: {
    Args: {
      p_booking_id: string
      p_limit: number
    }
    Returns: Json
  }

  worker_get_incident_summary: {
    Args: {
      p_booking_id: string
    }
    Returns: Json
  }

  worker_create_booking_change_request: {
    Args: {
      p_booking_id: string
      p_request_type: string
      p_reason: string
      p_requested_start?: string | null
      p_requested_end?: string | null
      p_occurrence_id?: string | null
    }
    Returns: Json
  }

  worker_withdraw_booking_change_request: {
    Args: {
      p_request_id: string
    }
    Returns: Json
  }
}

    Enums: {
      user_role: UserRole
      worker_status: WorkerStatus
      worker_application_status: WorkerApplicationStatus
      worker_document_type: WorkerDocumentType
      worker_document_status: WorkerDocumentStatus
      booking_status: BookingStatus
      booking_fulfillment_type: BookingFulfillmentType
      booking_duration_unit: BookingDurationUnit
      booking_worker_offer_status: BookingWorkerOfferStatus
    }

    CompositeTypes: {}
  }
}
