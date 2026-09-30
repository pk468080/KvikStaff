import { supabase } from '../../lib/supabase'

import type { BookingCreationResult } from '../../types/booking'

export type CreateInstantBookingInput = {
	serviceVariantId: string
	addressId: string
	startTime: string
	endTime: string
	notes?: string | null
}

export async function createCustomerInstantBooking(
	input: CreateInstantBookingInput,
): Promise<BookingCreationResult> {
	const { data, error } = await supabase.rpc(
		'create_customer_hourly_booking',
		{
			p_service_variant_id: input.serviceVariantId,
			p_address_id: input.addressId,
			p_booking_type: 'instant',
			p_scheduled_start: input.startTime,
			p_scheduled_end: input.endTime,
			p_notes:
  input.notes?.trim() || '',
		},
	)

	if (error) {
		throw error
	}

	if (!data) {
		throw new Error('The backend did not return a booking result.')
	}

	return data as BookingCreationResult
}
