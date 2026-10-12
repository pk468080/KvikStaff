import { createReceiptReference } from './invoice.service'

jest.mock('../../lib/api', () => ({
  apiRequest: jest.fn(),
}))

describe('createReceiptReference', () => {
  it('generates a formatted reference based on a booking ID', () => {
    const bookingId = 'abcdef1234567890'
    const result = createReceiptReference(bookingId)

    expect(result).toBe('KvikStaff-REC-ABCDEF12')
  })

  it('trims whitespace from the booking ID before generation', () => {
    const bookingId = '   hello12345   '
    const result = createReceiptReference(bookingId)

    expect(result).toBe('KvikStaff-REC-HELLO123')
  })

  it('throws an error if the booking ID is empty', () => {
    expect(() => createReceiptReference('')).toThrow('A booking ID is required.')
  })

  it('throws an error if the booking ID is only whitespace', () => {
    expect(() => createReceiptReference('   ')).toThrow('A booking ID is required.')
  })

  it('handles booking IDs shorter than 8 characters', () => {
    const bookingId = 'abc'
    const result = createReceiptReference(bookingId)

    expect(result).toBe('KvikStaff-REC-ABC')
  })
})
