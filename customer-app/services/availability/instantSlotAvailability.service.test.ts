jest.mock('../../lib/api', () => ({ apiRequest: jest.fn() }))

import { apiRequest } from '../../lib/api'
import { getInstantAvailabilitySlots } from './instantSlotAvailability.service'

const mockedApiRequest = apiRequest as jest.Mock

describe('instantSlotAvailability.service', () => {
  beforeEach(() => mockedApiRequest.mockReset())

  it('checks availability using coordinates without creating an address', async () => {
    mockedApiRequest.mockResolvedValue({
      service_area_available: true,
      instant_available: true,
      slots: [],
    })

    await getInstantAvailabilitySlots(
      'service-variant-1',
      { latitude: 28.6139, longitude: 77.2090 },
      2,
    )

    expect(mockedApiRequest).toHaveBeenCalledWith(
      '/availability/instant/slots',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          service_variant_id: 'service-variant-1',
          latitude: 28.6139,
          longitude: 77.2090,
          duration_hours: 2,
        }),
      }),
    )
    expect(mockedApiRequest.mock.calls[0][1].body).not.toContain('address_id')
  })
})
