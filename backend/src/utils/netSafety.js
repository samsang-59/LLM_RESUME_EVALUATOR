// The SSRF guard (Phase 7, docs 04/05/06): may we POST to this callbackUrl?
//
// The callbackUrl is chosen by the caller, and our server is the one that sends the
// request. Without a guard, anybody holding an ATS key could point it at a machine
// only WE can reach - localhost, the office network, or the cloud metadata service at
// 169.254.169.254 that hands out credentials - and use us as their way in. That is
// Server-Side Request Forgery.
//
// The rule from the design: https only, and never an internal address. It is
// enforced twice -
//
//   1. at submission (the validator): the URL as typed - scheme, "localhost", and
//      any IP address written directly into it. A bad URL is a 400 before any work.
//   2. at send time (webhookService): the hostname is resolved to its real IP
//      addresses and every one is checked, and the connection is made to the
//      address that was checked. That second check is what stops DNS rebinding - a
//      name that resolved to a public address when it was submitted and to
//      127.0.0.1 by the time we deliver.
//
// config.webhookAllowInsecure switches both checks off, for local development and
// the test suite, whose receivers run on http://127.0.0.1. It is off by default.
const dns = require('dns');
const net = require('net');

/**
 * Every address range that is not "somewhere on the public internet".
 * Sources: the IANA special-purpose registries (RFC 6890 and successors).
 */
const BLOCKED = new net.BlockList();
[
  ['0.0.0.0', 8], // "this network" - 0.0.0.0 reaches the local machine on most systems
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local - home of the cloud metadata service
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, including 255.255.255.255 broadcast
].forEach(([address, prefix]) => BLOCKED.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  // IPv4 written as IPv6 (::ffff:127.0.0.1) needs no rule of its own: BlockList
  // checks it against the IPv4 rules above. (A ::ffff:0:0/96 rule here would do the
  // reverse too, and match EVERY IPv4 address.) NAT64 is not translated that way,
  // and can carry any IPv4 address inside it, so it is blocked whole.
  ['64:ff9b::', 96],
  ['100::', 64], // discard-only
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local - IPv6's private range
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
].forEach(([address, prefix]) => BLOCKED.addSubnet(address, prefix, 'ipv6'));

/** Is this IP address one we must never send to? Anything that is not an IP is refused too. */
function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/** "localhost" and every name under it (RFC 6761) always mean this machine. */
function isLocalhostName(hostname) {
  const name = hostname.toLowerCase().replace(/\.$/, '');
  return name === 'localhost' || name.endsWith('.localhost');
}

/** URL.hostname keeps the brackets around an IPv6 literal: "[::1]" -> "::1". */
function bareHost(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/**
 * Check a URL as written - no network involved. Used by the validator at submission
 * and again by webhookService just before sending.
 *
 * The URL is parsed by the WHATWG parser first, which also normalises the tricks:
 * http://2130706433/ and http://0x7f.1/ both come out with hostname 127.0.0.1, so
 * the IP check below sees the real address.
 *
 * @param {string} value
 * @param {{allowInsecure?: boolean}} [options]
 * @returns {string|null} why the URL is refused, or null if it may be used
 */
function checkCallbackUrl(value, { allowInsecure = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return allowInsecure
      ? 'callbackUrl must be a valid http(s) URL'
      : 'callbackUrl must be a valid https URL';
  }

  if (allowInsecure) {
    // Development mode still refuses what is not a web address at all.
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : 'callbackUrl must be a valid http(s) URL';
  }

  if (url.protocol !== 'https:') return 'callbackUrl must use https';

  const host = bareHost(url.hostname);
  if (isLocalhostName(host)) return 'callbackUrl must not point to an internal address';
  if (net.isIP(host) && isBlockedAddress(host)) {
    return 'callbackUrl must not point to an internal address';
  }
  return null;
}

/** The error a blocked lookup fails with, so webhookService can tell it from a network error. */
const BLOCKED_CODE = 'ERR_SSRF_BLOCKED';

function blockedError(hostname, address) {
  const err = new Error(`blocked: ${hostname} resolves to an internal address (${address})`);
  err.code = BLOCKED_CODE;
  return err;
}

/**
 * A drop-in for dns.lookup that refuses internal addresses - handed to the HTTP
 * client as its `lookup` option, so the address checked here is exactly the address
 * the socket then connects to. There is no second lookup for an attacker's DNS
 * server to answer differently.
 *
 * Every address a name resolves to is checked, not only the first: a name with one
 * public and one private address is refused outright, because which one the
 * connection ends up using is not ours to choose.
 *
 * Same signature as dns.lookup, in both of the forms Node's sockets call it with
 * (`all: true` hands back the list, otherwise a single address and its family).
 */
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const opts = typeof options === 'number' ? { family: options } : { ...options };

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err);

    const bad = addresses.find(({ address }) => isBlockedAddress(address));
    if (bad) return callback(blockedError(hostname, bad.address));

    if (opts.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

module.exports = {
  checkCallbackUrl,
  isBlockedAddress,
  isLocalhostName,
  safeLookup,
  bareHost,
  BLOCKED_CODE,
};
