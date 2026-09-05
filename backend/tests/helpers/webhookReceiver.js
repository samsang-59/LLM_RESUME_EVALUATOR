// A stand-in for the ATS that submitted the resume.
//
// This is a REAL HTTP server, not a stubbed fetch. The webhook is the one place our
// code talks to somebody else's machine, so the test round has to prove the actual
// request goes out over the wire, with the right method, headers and body - and that
// we react correctly to whatever the other side answers, including nothing at all.
const http = require('http');

/**
 * Start a receiver on a free port.
 *
 * @param {object} options
 * @param {number|number[]|function} options.respondWith status code to answer with.
 *        An array is consumed one entry per request (so a test can say "fail twice,
 *        then succeed" and prove the retry works). A function gets the request count.
 * @param {boolean} options.hangUp destroy the socket instead of replying - the
 *        "their server is down mid-request" case.
 * @returns {Promise<{url, requests, close, reset}>} `requests` fills up as they arrive.
 */
async function startWebhookReceiver({ respondWith = 200, hangUp = false } = {}) {
  const requests = [];
  let count = 0;

  const statusFor = () => {
    count += 1;
    if (typeof respondWith === 'function') return respondWith(count);
    if (Array.isArray(respondWith)) return respondWith[Math.min(count - 1, respondWith.length - 1)];
    return respondWith;
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
      requests.push({ method: req.method, headers: req.headers, body, raw });

      if (hangUp) {
        req.socket.destroy();
        return;
      }
      const status = statusFor();
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    url: `http://127.0.0.1:${port}/hook`,
    requests,
    reset: () => {
      requests.length = 0;
      count = 0;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * A URL that is well-formed but that nothing is listening on - the "bad callback
 * URL" case, which must be handled without ever throwing out of the pipeline.
 */
const DEAD_URL = 'http://127.0.0.1:1/nothing-here';

module.exports = { startWebhookReceiver, DEAD_URL };
