import { bookingPath, invoicePath } from './host-links';

describe('host links', () => {
  it('builds the booking details path', () => {
    expect(bookingPath('h1', 'bk-9')).toBe('/host/h1/bookings/bk-9');
  });

  it('builds the invoice preview path', () => {
    expect(invoicePath('h1', 'rb-4')).toBe('/host/h1/invoices/view/rb-4');
  });

  // Every consumer adds the active locale itself, so a prefix here would be doubled.
  it('carries no locale prefix', () => {
    expect(bookingPath('h1', 'b')).toMatch(/^\/host\//);
    expect(invoicePath('h1', 'b')).toMatch(/^\/host\//);
  });
});
