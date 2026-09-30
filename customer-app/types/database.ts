export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string
          reason: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          reason?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_line: string
          created_at: string
          id: string
          label: string | null
          latitude: number
          location: unknown
          longitude: number
          user_id: string
        }
        Insert: {
          address_line: string
          created_at?: string
          id?: string
          label?: string | null
          latitude: number
          location: unknown
          longitude: number
          user_id: string
        }
        Update: {
          address_line?: string
          created_at?: string
          id?: string
          label?: string | null
          latitude?: number
          location?: unknown
          longitude?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          admin_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          admin_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_otps: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          expires_at: string | null
          id: string
          occurrence_id: string | null
          otp_hash: string
          otp_type: Database["public"]["Enums"]["otp_type"]
          status: Database["public"]["Enums"]["otp_status"]
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          occurrence_id?: string | null
          otp_hash: string
          otp_type: Database["public"]["Enums"]["otp_type"]
          status?: Database["public"]["Enums"]["otp_status"]
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          occurrence_id?: string | null
          otp_hash?: string
          otp_type?: Database["public"]["Enums"]["otp_type"]
          status?: Database["public"]["Enums"]["otp_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_otps_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_otps_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "booking_schedule_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_schedule_occurrences: {
        Row: {
          arrived_at: string | null
          base_amount: number
          booking_id: string
          completed_at: string | null
          created_at: string
          discount_amount: number
          end_otp_verified_at: string | null
          id: string
          journey_started_at: string | null
          last_modified_at: string | null
          last_modified_by: string | null
          occurrence_date: string
          occurrence_index: number
          original_occurrence_date: string | null
          platform_fee: number
          pricing_snapshot: Json
          scheduled_end: string
          scheduled_start: string
          start_otp_verified_at: string | null
          started_at: string | null
          status: string
          tax_amount: number
          total_amount: number
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          arrived_at?: string | null
          base_amount?: number
          booking_id: string
          completed_at?: string | null
          created_at?: string
          discount_amount?: number
          end_otp_verified_at?: string | null
          id?: string
          journey_started_at?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          occurrence_date: string
          occurrence_index: number
          original_occurrence_date?: string | null
          platform_fee?: number
          pricing_snapshot?: Json
          scheduled_end: string
          scheduled_start: string
          start_otp_verified_at?: string | null
          started_at?: string | null
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          arrived_at?: string | null
          base_amount?: number
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          discount_amount?: number
          end_otp_verified_at?: string | null
          id?: string
          journey_started_at?: string | null
          last_modified_at?: string | null
          last_modified_by?: string | null
          occurrence_date?: string
          occurrence_index?: number
          original_occurrence_date?: string | null
          platform_fee?: number
          pricing_snapshot?: Json
          scheduled_end?: string
          scheduled_start?: string
          start_otp_verified_at?: string | null
          started_at?: string | null
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_occurrences_last_modified_by_fkey"
            columns: ["last_modified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_schedule_occurrences_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_schedule_occurrences_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["booking_status"]
          old_status: Database["public"]["Enums"]["booking_status"] | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["booking_status"]
          old_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["booking_status"]
          old_status?: Database["public"]["Enums"]["booking_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_worker_offers: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          offered_at: string
          responded_at: string | null
          status: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["booking_worker_offer_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_worker_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_worker_offers_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address_id: string
          applied_promotion_id: string | null
          arrived_at: string | null
          base_amount: number
          completed_at: string | null
          created_at: string
          customer_id: string
          daily_end_time: string | null
          daily_start_time: string | null
          discount_amount: number
          duration_unit: Database["public"]["Enums"]["booking_duration_unit"]
          duration_value: number
          end_otp_verified_at: string | null
          fulfillment_type: Database["public"]["Enums"]["booking_fulfillment_type"]
          id: string
          journey_started_at: string | null
          journey_started_by: string | null
          notes: string | null
          off_dates: string[] | null
          platform_fee: number
          pricing_snapshot: Json | null
          schedule_end_date: string | null
          schedule_start_date: string | null
          scheduled_end: string
          scheduled_start: string
          selected_weekdays: number[] | null
          service_id: string
          service_variant_id: string
          start_otp_verified_at: string | null
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["booking_status"]
          tax_amount: number
          total_amount: number
          total_working_hours: number | null
          updated_at: string
          worker_accepted_at: string | null
          worker_id: string | null
        }
        Insert: {
          address_id: string
          applied_promotion_id?: string | null
          arrived_at?: string | null
          base_amount?: number
          completed_at?: string | null
          created_at?: string
          customer_id: string
          daily_end_time?: string | null
          daily_start_time?: string | null
          discount_amount?: number
          duration_unit: Database["public"]["Enums"]["booking_duration_unit"]
          duration_value: number
          end_otp_verified_at?: string | null
          fulfillment_type?: Database["public"]["Enums"]["booking_fulfillment_type"]
          id?: string
          journey_started_at?: string | null
          journey_started_by?: string | null
          notes?: string | null
          off_dates?: string[] | null
          platform_fee?: number
          pricing_snapshot?: Json | null
          schedule_end_date?: string | null
          schedule_start_date?: string | null
          scheduled_end: string
          scheduled_start: string
          selected_weekdays?: number[] | null
          service_id: string
          service_variant_id: string
          start_otp_verified_at?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tax_amount?: number
          total_amount?: number
          total_working_hours?: number | null
          updated_at?: string
          worker_accepted_at?: string | null
          worker_id?: string | null
        }
        Update: {
          address_id?: string
          applied_promotion_id?: string | null
          arrived_at?: string | null
          base_amount?: number
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          daily_end_time?: string | null
          daily_start_time?: string | null
          discount_amount?: number
          duration_unit?: Database["public"]["Enums"]["booking_duration_unit"]
          duration_value?: number
          end_otp_verified_at?: string | null
          fulfillment_type?: Database["public"]["Enums"]["booking_fulfillment_type"]
          id?: string
          journey_started_at?: string | null
          journey_started_by?: string | null
          notes?: string | null
          off_dates?: string[] | null
          platform_fee?: number
          pricing_snapshot?: Json | null
          schedule_end_date?: string | null
          schedule_start_date?: string | null
          scheduled_end?: string
          scheduled_start?: string
          selected_weekdays?: number[] | null
          service_id?: string
          service_variant_id?: string
          start_otp_verified_at?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tax_amount?: number
          total_amount?: number
          total_working_hours?: number | null
          updated_at?: string
          worker_accepted_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_applied_promotion_id_fkey"
            columns: ["applied_promotion_id"]
            isOneToOne: false
            referencedRelation: "home_promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_journey_started_by_fkey"
            columns: ["journey_started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_variant_id_fkey"
            columns: ["service_variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_policies: {
        Row: {
          cancellation_fee: number
          created_at: string
          effective_from: string
          effective_to: string | null
          hours_before_start: number
          id: string
          is_active: boolean
          name: string
          priority: number
          refund_percentage: number
          updated_at: string
        }
        Insert: {
          cancellation_fee?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          hours_before_start: number
          id?: string
          is_active?: boolean
          name: string
          priority?: number
          refund_percentage: number
          updated_at?: string
        }
        Update: {
          cancellation_fee?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          hours_before_start?: number
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          refund_percentage?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          booking_id: string
          created_at: string
          customer_id: string
          id: string
          last_message_at: string | null
          occurrence_id: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          customer_id: string
          id?: string
          last_message_at?: string | null
          occurrence_id?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          last_message_at?: string | null
          occurrence_id?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "booking_schedule_occurrences"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_favourite_services: {
        Row: {
          created_at: string
          customer_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favourite_services_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_favourite_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      home_promotions: {
        Row: {
          created_at: string
          cta_text: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          service_id: string | null
          sort_order: number
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          service_id?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          service_id?: string | null
          sort_order?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_promotions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      home_updates: {
        Row: {
          body: string | null
          created_at: string
          cta_text: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          service_id: string | null
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          service_id?: string | null
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          service_id?: string | null
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_updates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base_amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          platform_fee: number
          pricing_snapshot: Json
          status: string
          tax_amount: number
          total_amount: number
        }
        Insert: {
          base_amount?: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          platform_fee?: number
          pricing_snapshot?: Json
          status?: string
          tax_amount?: number
          total_amount?: number
        }
        Update: {
          base_amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          platform_fee?: number
          pricing_snapshot?: Json
          status?: string
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_receipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          occurrence_id: string | null
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string | null
          refund_request_id: string | null
          requested_at: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          occurrence_id?: string | null
          payment_id: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          refund_request_id?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          occurrence_id?: string | null
          payment_id?: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          refund_request_id?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "booking_schedule_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_name: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          signature_verified: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_name: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_verified?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_name?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          signature_verified?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      promotion_rules: {
        Row: {
          created_at: string
          discount_currency: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          maximum_discount_amount: number | null
          minimum_hours: number
          priority: number
          promotion_id: string
          stackable_with_duration_discount: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_currency?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          maximum_discount_amount?: number | null
          minimum_hours?: number
          priority?: number
          promotion_id: string
          stackable_with_duration_discount?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_currency?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          maximum_discount_amount?: number | null
          minimum_hours?: number
          priority?: number
          promotion_id?: string
          stackable_with_duration_discount?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_rules_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: true
            referencedRelation: "home_promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          order_id: string | null
          payload: Json
          payment_id: string | null
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          order_id?: string | null
          payload: Json
          payment_id?: string | null
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          order_id?: string | null
          payload?: Json
          payment_id?: string | null
          received_at?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string | null
          requested_at: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency?: string
          id?: string
          payment_id: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          payment_id?: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          customer_id: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          occurrence_id: string | null
          rating: number
          worker_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          occurrence_id?: string | null
          rating: number
          worker_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          occurrence_id?: string | null
          rating?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "booking_schedule_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_area_groups: {
        Row: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          radius_km: number
          state: string
          updated_at: string
        }
        Insert: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          radius_km: number
          state: string
          updated_at?: string
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          radius_km?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          radius_km: number
          service_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          radius_km: number
          service_id?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          center_latitude?: number
          center_longitude?: number
          city?: string
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          radius_km?: number
          service_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_areas_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "service_area_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_areas_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_availability_requests: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          latitude: number
          longitude: number
          service_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          latitude: number
          longitude: number
          service_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          latitude?: number
          longitude?: number
          service_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_availability_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_booking_schedule_policies: {
        Row: {
          created_at: string
          is_active: boolean
          service_id: string
          timezone: string
          updated_at: string
          working_weekdays: number[]
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          service_id: string
          timezone: string
          updated_at?: string
          working_weekdays: number[]
        }
        Update: {
          created_at?: string
          is_active?: boolean
          service_id?: string
          timezone?: string
          updated_at?: string
          working_weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "service_booking_schedule_policies_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: true
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_discount_tiers: {
        Row: {
          created_at: string
          discount_percent: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          max_hours: number | null
          min_hours: number
          name: string
          priority: number
          service_id: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_hours?: number | null
          min_hours: number
          name: string
          priority?: number
          service_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_hours?: number | null
          min_hours?: number
          name?: string
          priority?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_discount_tiers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_hourly_prices: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          price: number
          service_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price: number
          service_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_hourly_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_recurring_discount_tiers: {
        Row: {
          created_at: string
          discount_percent: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          max_calendar_days: number | null
          min_calendar_days: number
          name: string
          priority: number
          service_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_calendar_days?: number | null
          min_calendar_days: number
          name: string
          priority?: number
          service_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_calendar_days?: number | null
          min_calendar_days?: number
          name?: string
          priority?: number
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_recurring_discount_tiers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variant_discount_tiers: {
        Row: {
          created_at: string
          discount_percent: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          max_hours: number | null
          min_hours: number
          name: string
          priority: number
          service_variant_id: string
        }
        Insert: {
          created_at?: string
          discount_percent: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_hours?: number | null
          min_hours: number
          name: string
          priority?: number
          service_variant_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          max_hours?: number | null
          min_hours?: number
          name?: string
          priority?: number
          service_variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variant_discount_tiers_service_variant_id_fkey"
            columns: ["service_variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variant_hourly_prices: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          price: number
          service_variant_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price: number
          service_variant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price?: number
          service_variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variant_hourly_prices_service_variant_id_fkey"
            columns: ["service_variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variant_prices: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          price: number
          service_variant_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price: number
          service_variant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          price?: number
          service_variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variant_prices_service_variant_id_fkey"
            columns: ["service_variant_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variant_scheduling_rules: {
        Row: {
          created_at: string
          daily_duration_minutes: number | null
          is_active: boolean
          scheduling_mode: string
          service_variant_id: string
          updated_at: string
          working_days: number | null
        }
        Insert: {
          created_at?: string
          daily_duration_minutes?: number | null
          is_active?: boolean
          scheduling_mode: string
          service_variant_id: string
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          created_at?: string
          daily_duration_minutes?: number | null
          is_active?: boolean
          scheduling_mode?: string
          service_variant_id?: string
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_variant_scheduling_rules_service_variant_id_fkey"
            columns: ["service_variant_id"]
            isOneToOne: true
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variants: {
        Row: {
          billing_type: string
          created_at: string
          description: string | null
          duration_unit: string | null
          duration_value: number | null
          id: string
          is_active: boolean
          max_quantity: number | null
          min_quantity: number
          name: string
          service_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_type?: string
          created_at?: string
          description?: string | null
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          is_active?: boolean
          max_quantity?: number | null
          min_quantity?: number
          name: string
          service_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          description?: string | null
          duration_unit?: string | null
          duration_value?: number | null
          id?: string
          is_active?: boolean
          max_quantity?: number | null
          min_quantity?: number
          name?: string
          service_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variants_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          payment_id: string | null
          payment_refund_id: string | null
          refund_request_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          booking_id?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          payment_id?: string | null
          payment_refund_id?: string | null
          refund_request_id?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          booking_id?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          payment_id?: string | null
          payment_refund_id?: string | null
          refund_request_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_payment_refund_id_fkey"
            columns: ["payment_refund_id"]
            isOneToOne: false
            referencedRelation: "payment_refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_applications: {
        Row: {
          created_at: string
          id: string
          onboarding_type: string
          reapply_after: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["worker_application_status"]
          submitted_at: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          onboarding_type: string
          reapply_after?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["worker_application_status"]
          submitted_at?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          onboarding_type?: string
          reapply_after?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["worker_application_status"]
          submitted_at?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_applications_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_availability: {
        Row: {
          available_from: string
          available_until: string
          created_at: string
          id: string
          is_available: boolean
          worker_id: string
        }
        Insert: {
          available_from: string
          available_until: string
          created_at?: string
          id?: string
          is_available?: boolean
          worker_id: string
        }
        Update: {
          available_from?: string
          available_until?: string
          created_at?: string
          id?: string
          is_available?: boolean
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_availability_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_documents: {
        Row: {
          application_id: string
          created_at: string
          document_type: Database["public"]["Enums"]["worker_document_type"]
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["worker_document_status"]
          updated_at: string
          worker_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          document_type: Database["public"]["Enums"]["worker_document_type"]
          file_name?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["worker_document_status"]
          updated_at?: string
          worker_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          document_type?: Database["public"]["Enums"]["worker_document_type"]
          file_name?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["worker_document_status"]
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "worker_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_documents_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_earnings: {
        Row: {
          booking_id: string
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          platform_fee: number
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          platform_fee?: number
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          platform_fee?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_earnings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_earnings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_locations: {
        Row: {
          booking_id: string | null
          id: number
          latitude: number
          location: unknown
          longitude: number
          recorded_at: string
          worker_id: string
        }
        Insert: {
          booking_id?: string | null
          id?: never
          latitude: number
          location?: unknown
          longitude: number
          recorded_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string | null
          id?: never
          latitude?: number
          location?: unknown
          longitude?: number
          recorded_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_locations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_locations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_onboarding_profiles: {
        Row: {
          city: string | null
          consent_at: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          experience_summary: string | null
          experience_years: number | null
          gender: string | null
          onboarding_step: number
          permanent_address: string | null
          pincode: string | null
          profile_photo_path: string | null
          service_latitude: number | null
          service_longitude: number | null
          state: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          city?: string | null
          consent_at?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          experience_summary?: string | null
          experience_years?: number | null
          gender?: string | null
          onboarding_step?: number
          permanent_address?: string | null
          pincode?: string | null
          profile_photo_path?: string | null
          service_latitude?: number | null
          service_longitude?: number | null
          state?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          city?: string | null
          consent_at?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          experience_summary?: string | null
          experience_years?: number | null
          gender?: string | null
          onboarding_step?: number
          permanent_address?: string | null
          pincode?: string | null
          profile_photo_path?: string | null
          service_latitude?: number | null
          service_longitude?: number | null
          state?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_onboarding_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_presence: {
        Row: {
          expires_at: string | null
          is_available: boolean
          last_seen_at: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          expires_at?: string | null
          is_available?: boolean
          last_seen_at?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          expires_at?: string | null
          is_available?: boolean
          last_seen_at?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_presence_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_profiles: {
        Row: {
          created_at: string
          current_location: unknown
          id: string
          is_featured: boolean
          is_verified: boolean
          rating: number
          service_radius_km: number
          total_completed_jobs: number
          updated_at: string
          worker_status: Database["public"]["Enums"]["worker_status"]
        }
        Insert: {
          created_at?: string
          current_location?: unknown
          id: string
          is_featured?: boolean
          is_verified?: boolean
          rating?: number
          service_radius_km?: number
          total_completed_jobs?: number
          updated_at?: string
          worker_status?: Database["public"]["Enums"]["worker_status"]
        }
        Update: {
          created_at?: string
          current_location?: unknown
          id?: string
          is_featured?: boolean
          is_verified?: boolean
          rating?: number
          service_radius_km?: number
          total_completed_jobs?: number
          updated_at?: string
          worker_status?: Database["public"]["Enums"]["worker_status"]
        }
        Relationships: [
          {
            foreignKeyName: "worker_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_push_deliveries: {
        Row: {
          created_at: string
          expo_ticket_id: string | null
          id: string
          notification_id: string
          push_token_id: string | null
          receipt_checked_at: string | null
          receipt_error: string | null
          receipt_status: string | null
          sent_at: string
          ticket_error: string | null
          ticket_status: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_ticket_id?: string | null
          id?: string
          notification_id: string
          push_token_id?: string | null
          receipt_checked_at?: string | null
          receipt_error?: string | null
          receipt_status?: string | null
          sent_at?: string
          ticket_error?: string | null
          ticket_status?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_ticket_id?: string | null
          id?: string
          notification_id?: string
          push_token_id?: string | null
          receipt_checked_at?: string | null
          receipt_error?: string | null
          receipt_status?: string | null
          sent_at?: string
          ticket_error?: string | null
          ticket_status?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_push_deliveries_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "push_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_push_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_push_tokens: {
        Row: {
          device_type: string | null
          expo_push_token: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          device_type?: string | null
          expo_push_token: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          device_type?: string | null
          expo_push_token?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: []
      }
      worker_schedule_exceptions: {
        Row: {
          created_at: string
          end_time: string | null
          exception_date: string
          exception_type: string
          id: string
          is_active: boolean
          reason: string | null
          start_time: string | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          exception_date: string
          exception_type: string
          id?: string
          is_active?: boolean
          reason?: string | null
          start_time?: string | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          exception_date?: string
          exception_type?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          start_time?: string | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_schedule_exceptions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_schedule_settings: {
        Row: {
          created_at: string
          slot_interval_minutes: number | null
          timezone: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          slot_interval_minutes?: number | null
          timezone: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          slot_interval_minutes?: number | null
          timezone?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_schedule_settings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_services: {
        Row: {
          created_at: string
          service_id: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          worker_id: string
        }
        Update: {
          created_at?: string
          service_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_services_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_weekly_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_weekly_schedules_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "worker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_assign_booking_worker: {
        Args: { p_booking_id: string; p_worker_id: string }
        Returns: Json
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      admin_cancel_booking_occurrence: {
        Args: { p_occurrence_id: string; p_reason?: string }
        Returns: Json
      }
      admin_create_notification: {
        Args: {
          p_booking_id?: string
          p_message: string
          p_notification_type?: string
          p_title: string
          p_user_id: string
        }
        Returns: {
          booking_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string | null
          title: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_service:
        | {
            Args: {
              p_currency?: string
              p_description?: string
              p_hourly_price?: number
              p_image_url?: string
              p_is_active?: boolean
              p_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_category_id?: string
              p_currency?: string
              p_description?: string
              p_display_order?: number
              p_hourly_price?: number
              p_image_url?: string
              p_is_active?: boolean
              p_is_featured?: boolean
              p_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_currency?: string
              p_description?: string
              p_hourly_price?: number
              p_is_active?: boolean
              p_name: string
            }
            Returns: Json
          }
      admin_get_booking_detail: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      admin_list_invoices: { Args: never; Returns: Json }
      admin_list_payment_refunds: { Args: never; Returns: Json }
      admin_list_payment_webhook_events: { Args: never; Returns: Json }
      admin_list_payments: { Args: never; Returns: Json }
      admin_list_razorpay_webhook_events: { Args: never; Returns: Json }
      admin_list_refund_requests: { Args: never; Returns: Json }
      admin_list_service_areas: {
        Args: never
        Returns: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          radius_km: number
          service_id: string
          service_name: string
          state: string
          updated_at: string
        }[]
      }
      admin_list_service_areas_v3: {
        Args: never
        Returns: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          id: string
          is_active: boolean
          is_legacy: boolean
          name: string
          radius_km: number
          service_count: number
          service_ids: string[]
          service_names: string[]
          state: string
          updated_at: string
        }[]
      }
      admin_moderate_review: {
        Args: {
          p_moderation_status: string
          p_reason?: string
          p_review_id: string
        }
        Returns: Json
      }
      admin_remove_worker: { Args: { p_worker_id: string }; Returns: Json }
      admin_review_account_deletion: {
        Args: { p_request_id: string; p_status: string }
        Returns: Json
      }
      admin_review_worker_application: {
        Args: {
          p_application_id: string
          p_notes?: string
          p_status: Database["public"]["Enums"]["worker_application_status"]
        }
        Returns: Json
      }
      admin_review_worker_document: {
        Args: {
          p_document_id: string
          p_rejection_reason?: string
          p_status: Database["public"]["Enums"]["worker_document_status"]
        }
        Returns: Json
      }
      admin_set_customer_active: {
        Args: { p_customer_id: string; p_is_active: boolean }
        Returns: Json
      }
      admin_set_service_active: {
        Args: { p_is_active: boolean; p_service_id: string }
        Returns: Json
      }
      admin_set_worker_status: {
        Args: {
          p_status: Database["public"]["Enums"]["worker_status"]
          p_worker_id: string
        }
        Returns: Json
      }
      admin_update_current_hourly_service_price: {
        Args: { p_currency?: string; p_price: number; p_service_id: string }
        Returns: Json
      }
      admin_update_service_availability_request: {
        Args: { p_request_id: string; p_status: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          latitude: number
          longitude: number
          service_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_availability_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_service_catalog: {
        Args: {
          p_category_id?: string
          p_description?: string
          p_display_order?: number
          p_image_url?: string
          p_is_active?: boolean
          p_is_featured?: boolean
          p_name: string
          p_service_id: string
        }
        Returns: {
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "services"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_support_ticket: {
        Args: { p_admin_notes?: string; p_status: string; p_ticket_id: string }
        Returns: {
          admin_notes: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          payment_id: string | null
          payment_refund_id: string | null
          refund_request_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_worker: {
        Args: {
          p_full_name?: string
          p_is_featured?: boolean
          p_is_verified?: boolean
          p_phone?: string
          p_service_radius_km?: number
          p_worker_id: string
          p_worker_status?: Database["public"]["Enums"]["worker_status"]
        }
        Returns: Json
      }
      admin_upsert_service:
        | {
            Args: {
              p_description: string
              p_id: string
              p_is_active?: boolean
              p_name: string
            }
            Returns: {
              category_id: string | null
              created_at: string
              description: string | null
              display_order: number
              id: string
              image_url: string | null
              is_active: boolean
              is_featured: boolean
              name: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "services"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_description: string
              p_id: string
              p_image_url?: string
              p_is_active?: boolean
              p_name: string
            }
            Returns: {
              category_id: string | null
              created_at: string
              description: string | null
              display_order: number
              id: string
              image_url: string | null
              is_active: boolean
              is_featured: boolean
              name: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "services"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_upsert_service_area: {
        Args: {
          p_center_latitude: number
          p_center_longitude: number
          p_city: string
          p_id: string
          p_is_active?: boolean
          p_name: string
          p_radius_km: number
          p_state: string
        }
        Returns: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          radius_km: number
          service_id: string | null
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_areas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_service_area_v2: {
        Args: {
          p_center_latitude: number
          p_center_longitude: number
          p_city: string
          p_id: string
          p_is_active?: boolean
          p_name: string
          p_radius_km: number
          p_service_id: string
          p_state: string
        }
        Returns: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          name: string
          radius_km: number
          service_id: string | null
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_areas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_service_area_v3: {
        Args: {
          p_center_latitude: number
          p_center_longitude: number
          p_city: string
          p_id: string
          p_is_active: boolean
          p_name: string
          p_radius_km: number
          p_service_ids?: string[]
          p_state: string
        }
        Returns: {
          center_latitude: number
          center_longitude: number
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          radius_km: number
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_area_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_service_price: {
        Args: {
          p_currency?: string
          p_effective_from?: string
          p_effective_to?: string
          p_id: string
          p_is_active?: boolean
          p_price: number
          p_service_variant_id: string
        }
        Returns: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          price: number
          service_variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "service_variant_prices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_service_variant: {
        Args: {
          p_billing_type: string
          p_description: string
          p_duration_unit: string
          p_duration_value: number
          p_id: string
          p_is_active?: boolean
          p_max_quantity: number
          p_min_quantity: number
          p_name: string
          p_service_id: string
          p_sort_order?: number
        }
        Returns: {
          billing_type: string
          created_at: string
          description: string | null
          duration_unit: string | null
          duration_value: number | null
          id: string
          is_active: boolean
          max_quantity: number | null
          min_quantity: number
          name: string
          service_id: string
          sort_order: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_variants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_paid_booking_worker: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      auto_assign_waiting_scheduled_bookings_for_worker: {
        Args: { p_worker_id: string }
        Returns: number
      }
      auto_dispatch_waiting_bookings_for_worker: {
        Args: { p_worker_id: string }
        Returns: number
      }
      calculate_cancellation_refund: {
        Args: {
          p_amount: number
          p_reference_time?: string
          p_scheduled_start: string
        }
        Returns: Json
      }
      calculate_customer_booking_schedule: {
        Args: {
          p_address_id: string
          p_daily_end_time: string
          p_daily_start_time: string
          p_end_date: string
          p_off_dates?: string[]
          p_selected_weekdays: number[]
          p_service_variant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      calculate_multi_occurrence_booking_price: {
        Args: {
          p_booking_type?: Database["public"]["Enums"]["booking_fulfillment_type"]
          p_daily_end_time: string
          p_daily_start_time: string
          p_off_dates?: string[]
          p_schedule_end_date: string
          p_schedule_start_date: string
          p_selected_weekdays: number[]
          p_service_variant_id: string
        }
        Returns: Json
      }
      calculate_platform_charges: {
        Args: { p_subtotal: number }
        Returns: Json
      }
      calculate_recurring_occurrence_price: {
        Args: {
          p_commitment_days: number
          p_occurrence_hours: number
          p_service_variant_id: string
        }
        Returns: Json
      }
      calculate_service_booking_price: {
        Args: { p_service_variant_id: string; p_total_working_hours: number }
        Returns: Json
      }
      can_access_booking_communication: {
        Args: { p_booking_id: string; p_occurrence_id?: string }
        Returns: boolean
      }
      cancel_customer_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_customer_booking_occurrence: {
        Args: { p_occurrence_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_customer_booking_series: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_service_availability_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          latitude: number
          longitude: number
          service_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_availability_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_account_phone: { Args: { p_phone: string }; Returns: Json }
      check_customer_instant_worker_availability: {
        Args: { p_latitude: number; p_longitude: number; p_service_id: string }
        Returns: Json
      }
      check_service_availability: {
        Args: {
          p_customer_latitude: number
          p_customer_longitude: number
          p_service_id: string
        }
        Returns: Json
      }
      complete_test_payment: { Args: { p_booking_id: string }; Returns: Json }
      create_customer_booking: {
        Args: {
          p_address_id: string
          p_fulfillment_type: Database["public"]["Enums"]["booking_fulfillment_type"]
          p_notes?: string
          p_scheduled_start: string
          p_service_variant_id: string
        }
        Returns: Json
      }
      create_customer_hourly_booking: {
        Args: {
          p_address_id: string
          p_booking_type: Database["public"]["Enums"]["booking_fulfillment_type"]
          p_notes: string
          p_scheduled_end: string
          p_scheduled_start: string
          p_service_variant_id: string
        }
        Returns: Json
      }
      create_customer_multi_occurrence_booking: {
        Args: {
          p_address_id: string
          p_booking_type?: Database["public"]["Enums"]["booking_fulfillment_type"]
          p_daily_end_time: string
          p_daily_start_time: string
          p_notes?: string
          p_off_dates?: string[]
          p_schedule_end_date: string
          p_schedule_start_date: string
          p_selected_weekdays: number[]
          p_service_variant_id: string
        }
        Returns: Json
      }
      create_customer_recurring_booking: {
        Args: {
          p_address_id: string
          p_daily_end_time: string
          p_daily_start_time: string
          p_notes?: string
          p_off_dates?: string[]
          p_schedule_end_date: string
          p_schedule_start_date: string
          p_selected_weekdays: number[]
          p_service_variant_id: string
        }
        Returns: Json
      }
      create_customer_review: {
        Args: {
          p_booking_id: string
          p_comment?: string
          p_occurrence_id?: string
          p_rating: number
          p_worker_id: string
        }
        Returns: Json
      }
      create_customer_scheduled_booking: {
        Args: {
          p_address_id: string
          p_daily_end_time: string
          p_daily_start_time: string
          p_notes?: string
          p_off_dates?: string[]
          p_schedule_end_date: string
          p_schedule_start_date: string
          p_selected_weekdays: number[]
          p_service_variant_id: string
        }
        Returns: Json
      }
      create_customer_scheduled_range_booking: {
        Args: {
          p_address_id: string
          p_daily_end_time: string
          p_daily_start_time: string
          p_end_date: string
          p_notes?: string
          p_off_dates?: string[]
          p_service_variant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      create_support_ticket: {
        Args: {
          p_booking_id?: string
          p_category: string
          p_description: string
          p_payment_id?: string
          p_payment_refund_id?: string
          p_refund_request_id?: string
          p_subject: string
          p_worker_id?: string
        }
        Returns: {
          admin_notes: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          payment_id: string | null
          payment_refund_id: string | null
          refund_request_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_worker_support_ticket: {
        Args: {
          p_booking_id?: string
          p_category: string
          p_description: string
          p_subject: string
        }
        Returns: {
          admin_notes: string | null
          booking_id: string | null
          category: string
          created_at: string
          description: string
          id: string
          payment_id: string | null
          payment_refund_id: string | null
          refund_request_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      customer_booking_action: {
        Args: { p_action: string; p_booking_id: string }
        Returns: Json
      }
      customer_has_active_booking_overlap: {
        Args: {
          p_customer_id: string
          p_end: string
          p_exclude_booking_id?: string
          p_start: string
        }
        Returns: boolean
      }
      disablelongtransactions: { Args: never; Returns: string }
      dispatch_booking_worker_offers: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      dispatch_booking_worker_offers_internal: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_booking_worker_offers: { Args: never; Returns: number }
      finalize_payment_refund: {
        Args: {
          p_failure_reason?: string
          p_provider_refund_id?: string
          p_refund_id: string
          p_status: string
        }
        Returns: Json
      }
      finalize_razorpay_payment: {
        Args: {
          p_paid_at?: string
          p_payment_id: string
          p_provider_payment_id: string
        }
        Returns: Json
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_configured_gst_rate_percent: { Args: never; Returns: number }
      get_customer_instant_availability_slots: {
        Args: {
          p_address_id: string
          p_duration_hours?: number
          p_service_variant_id: string
        }
        Returns: Json
      }
      get_customer_near_term_scheduled_slots: {
        Args: { p_address_id: string; p_service_variant_id: string }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      get_customer_scheduled_availability_slots: {
        Args: {
          p_address_id: string
          p_duration_hours?: number
          p_end: string
          p_service_variant_id: string
          p_start: string
        }
        Returns: Json
      }
      get_customer_scheduled_slots: {
        Args: {
          p_address_id: string
          p_end_date: string
          p_service_variant_id: string
          p_start_date: string
        }
        Returns: {
          slot_end: string
          slot_start: string
        }[]
      }
      get_eligible_workers: { Args: { p_booking_id: string }; Returns: Json }
      get_next_available_worker_slots: {
        Args: {
          p_address_id: string
          p_days?: number
          p_duration_minutes: number
          p_from?: string
          p_service_id: string
        }
        Returns: {
          slot_end: string
          slot_start: string
          worker_count: number
        }[]
      }
      get_recurring_booking_max_horizon_days: { Args: never; Returns: number }
      gettransactionid: { Args: never; Returns: unknown }
      is_admin: { Args: never; Returns: boolean }
      is_booking_within_operating_hours: {
        Args: { p_end: string; p_start: string }
        Returns: boolean
      }
      issue_booking_invoice: { Args: { p_booking_id: string }; Returns: Json }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      modify_customer_booking: {
        Args: {
          p_address_id?: string
          p_booking_id: string
          p_duration_hours?: number
          p_notes?: string
          p_scheduled_start?: string
        }
        Returns: Json
      }
      modify_customer_booking_occurrence: {
        Args: { p_new_date: string; p_occurrence_id: string }
        Returns: Json
      }
      normalize_account_phone: { Args: { p_phone: string }; Returns: string }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_razorpay_webhook_event: {
        Args: { p_event_id: string }
        Returns: Json
      }
      reconcile_expired_worker_presence: { Args: never; Returns: number }
      reconcile_paid_booking: { Args: { p_booking_id: string }; Returns: Json }
      record_razorpay_webhook_event: {
        Args: { p_event_id: string; p_event_name: string; p_payload: Json }
        Returns: Json
      }
      record_worker_booking_location: {
        Args: { p_booking_id: string; p_latitude: number; p_longitude: number }
        Returns: {
          booking_id: string | null
          id: number
          latitude: number
          location: unknown
          longitude: number
          recorded_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_locations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_customer_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "push_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_worker_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "push_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_booking_refund: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      request_service_availability: {
        Args: { p_latitude: number; p_longitude: number; p_service_id: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          latitude: number
          longitude: number
          service_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "service_availability_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_customer_booking: {
        Args: { p_booking_id: string; p_new_end: string; p_new_start: string }
        Returns: Json
      }
      save_worker_document: {
        Args: {
          p_document_type: Database["public"]["Enums"]["worker_document_type"]
          p_file_name?: string
          p_file_path: string
          p_file_size?: number
          p_mime_type?: string
        }
        Returns: {
          application_id: string
          created_at: string
          document_type: Database["public"]["Enums"]["worker_document_type"]
          file_name: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["worker_document_status"]
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_worker_onboarding: {
        Args: {
          p_city?: string
          p_current_address?: string
          p_date_of_birth?: string
          p_experience_summary?: string
          p_experience_years?: number
          p_gender?: string
          p_onboarding_step?: number
          p_permanent_address?: string
          p_pincode?: string
          p_profile_photo_path?: string
          p_service_latitude?: number
          p_service_longitude?: number
          p_state?: string
        }
        Returns: {
          city: string | null
          consent_at: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          experience_summary: string | null
          experience_years: number | null
          gender: string | null
          onboarding_step: number
          permanent_address: string | null
          pincode: string | null
          profile_photo_path: string | null
          service_latitude: number | null
          service_longitude: number | null
          state: string | null
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_onboarding_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_refund_request_result: {
        Args: {
          p_provider_refund_id?: string
          p_refund_id: string
          p_status: string
        }
        Returns: Json
      }
      set_worker_onboarding_consent: {
        Args: never
        Returns: {
          city: string | null
          consent_at: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          experience_summary: string | null
          experience_years: number | null
          gender: string | null
          onboarding_step: number
          permanent_address: string | null
          pincode: string | null
          profile_photo_path: string | null
          service_latitude: number | null
          service_longitude: number | null
          state: string | null
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_onboarding_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_worker_services: { Args: { p_service_ids: string[] }; Returns: Json }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      submit_worker_application: {
        Args: never
        Returns: {
          created_at: string
          id: string
          onboarding_type: string
          reapply_after: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["worker_application_status"]
          submitted_at: string | null
          updated_at: string
          worker_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worker_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_booking_occurrence_state: {
        Args: { p_new_status: string; p_occurrence_id: string }
        Returns: Json
      }
      transition_booking_state: {
        Args: {
          p_booking_id: string
          p_clear_worker?: boolean
          p_new_status: Database["public"]["Enums"]["booking_status"]
          p_set_worker?: boolean
          p_worker_id?: string
        }
        Returns: Json
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_worker_booking_status: {
        Args: {
          p_booking_id: string
          p_status: Database["public"]["Enums"]["booking_status"]
        }
        Returns: {
          address_id: string
          applied_promotion_id: string | null
          arrived_at: string | null
          base_amount: number
          completed_at: string | null
          created_at: string
          customer_id: string
          daily_end_time: string | null
          daily_start_time: string | null
          discount_amount: number
          duration_unit: Database["public"]["Enums"]["booking_duration_unit"]
          duration_value: number
          end_otp_verified_at: string | null
          fulfillment_type: Database["public"]["Enums"]["booking_fulfillment_type"]
          id: string
          journey_started_at: string | null
          journey_started_by: string | null
          notes: string | null
          off_dates: string[] | null
          platform_fee: number
          pricing_snapshot: Json | null
          schedule_end_date: string | null
          schedule_start_date: string | null
          scheduled_end: string
          scheduled_start: string
          selected_weekdays: number[] | null
          service_id: string
          service_variant_id: string
          start_otp_verified_at: string | null
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["booking_status"]
          tax_amount: number
          total_amount: number
          total_working_hours: number | null
          updated_at: string
          worker_accepted_at: string | null
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      verify_booking_occurrence_otp_atomic: {
        Args: {
          p_occurrence_id: string
          p_otp_hash: string
          p_otp_type: string
        }
        Returns: Json
      }
      verify_booking_otp_atomic: {
        Args: { p_booking_id: string; p_otp_hash: string; p_otp_type: string }
        Returns: Json
      }
      worker_booking_action: {
        Args: { p_action: string; p_booking_id: string }
        Returns: Json
      }
      worker_can_cover_scheduled_booking: {
        Args: { p_booking_id: string; p_worker_id: string }
        Returns: boolean
      }
      worker_covers_booking_interval: {
        Args: {
          p_end: string
          p_service_id: string
          p_start: string
          p_worker_id: string
        }
        Returns: boolean
      }
      worker_get_booking_context: {
        Args: { p_booking_id: string }
        Returns: Json
      }
      worker_occurrence_action: {
        Args: { p_action: string; p_occurrence_id: string }
        Returns: Json
      }
      worker_presence_heartbeat: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: Json
      }
      worker_respond_to_offer: {
        Args: { p_offer_id: string; p_response: string }
        Returns: Json
      }
      worker_set_presence: { Args: { p_available: boolean }; Returns: Json }
      worker_update_location: {
        Args: { p_booking_id?: string; p_latitude: number; p_longitude: number }
        Returns: Json
      }
      write_admin_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      booking_duration_unit: "day" | "week" | "month" | "hour"
      booking_fulfillment_type: "instant" | "scheduled" | "recurring"
      booking_status:
        | "pending_payment"
        | "paid"
        | "searching_worker"
        | "assigned"
        | "on_the_way"
        | "arrived"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "expired"
        | "payment_failed"
      booking_worker_offer_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "cancelled"
      otp_status: "pending" | "verified" | "expired" | "failed"
      otp_type: "start" | "end"
      payment_status:
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      user_role: "customer" | "worker" | "admin"
      worker_application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "changes_required"
        | "approved"
        | "rejected"
      worker_document_status: "pending" | "approved" | "rejected"
      worker_document_type:
        | "aadhaar"
        | "pan"
        | "passport_photo"
        | "address_proof"
        | "police_verification"
        | "bank_account"
      worker_status: "offline" | "available" | "busy" | "suspended"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booking_duration_unit: ["day", "week", "month", "hour"],
      booking_fulfillment_type: ["instant", "scheduled", "recurring"],
      booking_status: [
        "pending_payment",
        "paid",
        "searching_worker",
        "assigned",
        "on_the_way",
        "arrived",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
        "payment_failed",
      ],
      booking_worker_offer_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "cancelled",
      ],
      otp_status: ["pending", "verified", "expired", "failed"],
      otp_type: ["start", "end"],
      payment_status: [
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      user_role: ["customer", "worker", "admin"],
      worker_application_status: [
        "draft",
        "submitted",
        "under_review",
        "changes_required",
        "approved",
        "rejected",
      ],
      worker_document_status: ["pending", "approved", "rejected"],
      worker_document_type: [
        "aadhaar",
        "pan",
        "passport_photo",
        "address_proof",
        "police_verification",
        "bank_account",
      ],
      worker_status: ["offline", "available", "busy", "suspended"],
    },
  },
} as const
