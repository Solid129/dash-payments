import { signPayload, verifySignature } from './webhook-signature';

const SECRET = 'a-shared-secret-that-is-long-enough';

describe('webhook signature', () => {
  it('accepts a validly signed, fresh delivery', () => {
    const body = JSON.stringify({ hello: 'world' });
    const now = Math.floor(Date.now() / 1000);
    const header = signPayload(body, SECRET, now);

    const result = verifySignature({ rawBody: body, header, secret: SECRET, nowSeconds: now });
    expect(result).toEqual({ valid: true });
  });

  it('rejects a tampered body', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signPayload(JSON.stringify({ amount: 100 }), SECRET, now);

    const result = verifySignature({
      rawBody: JSON.stringify({ amount: 999_999 }),
      header,
      secret: SECRET,
      nowSeconds: now,
    });
    expect(result).toEqual({ valid: false, reason: 'digest_mismatch' });
  });

  it('rejects a signature produced with the wrong secret', () => {
    const body = JSON.stringify({ hello: 'world' });
    const now = Math.floor(Date.now() / 1000);
    const header = signPayload(body, 'a-completely-different-secret!!', now);

    const result = verifySignature({ rawBody: body, header, secret: SECRET, nowSeconds: now });
    expect(result).toEqual({ valid: false, reason: 'digest_mismatch' });
  });

  it('rejects a stale timestamp outside the tolerance window', () => {
    const body = JSON.stringify({ hello: 'world' });
    const now = Math.floor(Date.now() / 1000);
    const staleTimestamp = now - 3600; // one hour old
    const header = signPayload(body, SECRET, staleTimestamp);

    const result = verifySignature({ rawBody: body, header, secret: SECRET, nowSeconds: now });
    expect(result).toEqual({ valid: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('rejects a timestamp implausibly far in the future', () => {
    const body = JSON.stringify({ hello: 'world' });
    const now = Math.floor(Date.now() / 1000);
    const header = signPayload(body, SECRET, now + 3600);

    const result = verifySignature({ rawBody: body, header, secret: SECRET, nowSeconds: now });
    expect(result).toEqual({ valid: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('rejects a missing signature header', () => {
    const result = verifySignature({ rawBody: '{}', header: undefined, secret: SECRET });
    expect(result).toEqual({ valid: false, reason: 'missing_signature' });
  });

  it.each([
    'not-even-close',
    't=abc,v1=deadbeef',
    'v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    't=123',
  ])('rejects a malformed header: %s', (header) => {
    const result = verifySignature({ rawBody: '{}', header, secret: SECRET });
    expect(result).toEqual({ valid: false, reason: 'malformed_signature' });
  });

  it('accepts a delivery right at the edge of the tolerance window', () => {
    const body = '{}';
    const now = Math.floor(Date.now() / 1000);
    const header = signPayload(body, SECRET, now - 299);

    expect(verifySignature({ rawBody: body, header, secret: SECRET, nowSeconds: now })).toEqual({
      valid: true,
    });
  });
});
