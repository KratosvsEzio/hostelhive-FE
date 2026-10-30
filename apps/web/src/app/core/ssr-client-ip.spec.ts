import express from 'express';
import { AddressInfo } from 'node:net';
import { normaliseClientIp, parseTrustProxy } from './ssr-client-ip';

/**
 * Which address the server reports to the API as the visitor's.
 *
 * Getting this wrong either way is a real failure: trust too much and a scraper sets its own
 * `X-Forwarded-For` to dodge its limit; trust too little and every visitor shares the proxy's
 * address and the whole site is throttled as one client.
 */
describe('parseTrustProxy', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['  ', 0],
    ['0', 0],
    ['1', 1],
    [' 2 ', 2],
  ])('reads %j as %d hops', (value, hops) => {
    expect(parseTrustProxy(value)).toBe(hops);
  });

  it.each(['true', 'loopback', '-1', '1.5', 'one'])('refuses %j rather than guess', (value) => {
    expect(parseTrustProxy(value)).toBeNull();
  });
});

describe('normaliseClientIp', () => {
  it('drops the IPv4-mapped prefix Node reports on a dual-stack socket', () => {
    expect(normaliseClientIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it.each(['203.0.113.7', '2001:db8::1', '::1'])('keeps %s as it is', (ip) => {
    expect(normaliseClientIp(ip)).toBe(ip);
  });

  it.each([undefined, '', ' '])('has no IP for %j', (ip) => {
    expect(normaliseClientIp(ip)).toBeNull();
  });
});

/**
 * The same `trust proxy` setting `server.ts` applies, on a real Express server, so the claim
 * that a forged `X-Forwarded-For` entry is never read is checked against Express itself.
 */
describe('Express under SSR_TRUST_PROXY', () => {
  async function ipSeen(hops: number, forwardedFor?: string): Promise<string | null> {
    const app = express();
    app.set('trust proxy', parseTrustProxy(String(hops)));
    app.get('/', (req, res) => {
      res.send(normaliseClientIp(req.ip) ?? '');
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((done) => server.once('listening', done));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {},
      });
      return (await res.text()) || null;
    } finally {
      await new Promise((done) => server.close(done));
    }
  }

  it('uses the TCP peer with no proxy trusted, whatever the visitor sends', async () => {
    expect(await ipSeen(0, '198.51.100.9')).toBe('127.0.0.1');
  });

  // One proxy in front appends the real peer: "<whatever the visitor sent>, <real visitor>".
  it('takes the entry the trusted proxy appended, not the forged one before it', async () => {
    expect(await ipSeen(1, '198.51.100.9, 203.0.113.7')).toBe('203.0.113.7');
  });

  // Two proxies (a CDN, then a load balancer): the second appends the CDN's address.
  it('counts hops from the right', async () => {
    expect(await ipSeen(2, '198.51.100.9, 203.0.113.7, 10.0.0.2')).toBe('203.0.113.7');
  });
});
