import { mapCustomerInvoice, CustomerInvoice } from './invoice.service';

jest.mock('../../lib/api', () => ({
  apiRequest: jest.fn(),
}));

describe('mapCustomerInvoice', () => {
  it('should return the invoice object passed to it', () => {
    const mockInvoice: CustomerInvoice = {
      invoiceReference: 'KvikStaff-REC-12345678',
      bookingId: '12345678-abcd-abcd-abcd-1234567890ab',
      paymentId: 'pay_123',
      serviceName: 'Cleaning Service',
      bookingType: 'standard',
      scheduledStart: '2023-10-10T10:00:00Z',
      scheduledEnd: '2023-10-10T12:00:00Z',
      workingHours: 2,
      completedAt: '2023-10-10T12:30:00Z',
      subtotal: 100,
      discountAmount: 10,
      platformFee: 5,
      taxAmount: 20,
      totalAmount: 115,
      currency: 'INR',
      paymentStatus: 'paid',
      paymentProvider: 'razorpay',
      providerPaymentId: 'rp_123',
      providerOrderId: 'ro_123',
      paidAt: '2023-10-10T10:05:00Z',
      createdAt: '2023-10-10T10:00:00Z',
    };

    const result = mapCustomerInvoice(mockInvoice);

    expect(result).toBe(mockInvoice);
    expect(result).toEqual(mockInvoice);
  });
});
