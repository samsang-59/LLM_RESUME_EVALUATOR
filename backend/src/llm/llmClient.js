// The LLM adapter - its own layer (doc 01), the only file that knows we use OpenAI.
//
// Everything above it (extractionService, matchingService) asks for "a structured
// answer to this prompt" and gets back a plain object. Swapping providers, or
// mocking the LLM in tests, is a change to this one file / one jest.mock().
//
// It owns three things the services should not have to repeat:
//
//   1. STRUCTURED OUTPUT - a Zod schema is sent to the provider as a strict JSON
//      schema, so the reply can only come back in our fixed shape (doc 06's third
//      layer of prompt-injection defense), and is then re-validated locally. We
//      never trust the provider's promise; we check.
//   2. LOW TEMPERATURE - facts, not creativity (doc 06).
//   3. ERROR CLASSIFICATION + RETRY - doc 06's table:
//        network / timeout          -> retry with backoff  -> "network"
//        overloaded / rate-limited  -> retry with backoff  -> "llm_overloaded"
//        malformed output           -> NEVER retry, fail fast -> "malformed_output"
//      Retrying a malformed reply would just buy the same bad answer again, so it
//      fails on the first attempt. Retrying a 429 is free money-wise and usually works.
const { z } = require('zod');
const config = require('../config/env');
const { PipelineError, FAILURE_REASONS } = require('../utils/errors');

// Built on first use, not at import time: the test environment has no API key and
// must still be able to load every module.
let client = null;

function getClient() {
  if (!client) {
    if (!config.openaiApiKey) {
      throw new PipelineError(
        FAILURE_REASONS.INTERNAL,
        'OPENAI_API_KEY is not set - the pipeline cannot call the LLM'
      );
    }
    // Required lazily so the SDK is not loaded in tests that never touch it.
    // eslint-disable-next-line global-require
    const { OpenAI } = require('openai');
    // The SDK has its own retry logic; we turn it off and do our own, because ours
    // is the one that produces the failure_reason we have to store.
    client = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: config.llmTimeoutMs,
      maxRetries: 0,
    });
  }
  return client;
}

/** Zod -> the strict JSON schema OpenAI wants. `$schema` is dropped; it is not a keyword there. */
function toStrictJsonSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { target: 'draft-2020-12' });
  return jsonSchema;
}

/**
 * Which of doc 06's buckets is this failure, and is it worth trying again?
 * Errors are classified by status code first (the reliable signal) and by shape
 * second, so an SDK that renames its error classes cannot silently break this.
 */
function classify(err) {
  const status = err && (err.status || err.statusCode || (err.response && err.response.status));

  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return { reason: FAILURE_REASONS.LLM_OVERLOADED, retryable: true };
  }
  // 4xx that is not 429: our request is wrong (bad key, bad model, bad schema).
  // Trying again cannot fix it.
  if (typeof status === 'number' && status >= 400) {
    return { reason: FAILURE_REASONS.INTERNAL, retryable: false };
  }

  // No status at all = we never got an answer: DNS, socket, abort, timeout.
  return { reason: FAILURE_REASONS.NETWORK, retryable: true };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff: base, 2x base, 4x base ... (0 in tests, so they stay fast). */
function backoffMs(attempt) {
  return config.llmRetryBaseMs * 2 ** attempt;
}

/**
 * Ask the LLM one question and get a validated object back.
 *
 * @param {object}  options
 * @param {string}  options.system   OUR rules. The system role is the authority.
 * @param {string}  options.user     the untrusted material (resume text, skill lists).
 * @param {import('zod').ZodType} options.schema the only shape the answer may take.
 * @param {string}  options.schemaName a name for the schema, required by the API.
 * @returns {Promise<object>} the parsed, schema-checked answer
 * @throws {PipelineError} with a failureReason from doc 06's table
 */
async function complete({ system, user, schema, schemaName }) {
  const request = {
    model: config.llmModel,
    temperature: config.llmTemperature,
    messages: [
      // Role separation is defense layer 1: our instructions are in `system`, the
      // resume is only ever data in `user` (doc 06).
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema: toStrictJsonSchema(schema) },
    },
  };

  let lastError;

  // attempt 0 is the first try, so this runs 1 + llmMaxRetries times.
  for (let attempt = 0; attempt <= config.llmMaxRetries; attempt += 1) {
    let raw;

    try {
      const response = await getClient().chat.completions.create(request);
      raw = response.choices && response.choices[0] && response.choices[0].message.content;
    } catch (err) {
      if (err instanceof PipelineError) throw err; // missing key - not a transport problem

      const { reason, retryable } = classify(err);
      lastError = new PipelineError(reason, `LLM call failed: ${err.message}`, {
        cause: err,
        retryable,
      });
      if (!retryable || attempt === config.llmMaxRetries) throw lastError;

      await sleep(backoffMs(attempt));
      continue;
    }

    // We got an answer. From here on nothing is retryable: a badly shaped reply is
    // a deterministic result, and asking again would only cost money (doc 06).
    return parseAnswer(raw, schema);
  }

  throw lastError;
}

/** The reply, turned into our object - or a fail-fast malformed_output. */
function parseAnswer(raw, schema) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new PipelineError(FAILURE_REASONS.MALFORMED_OUTPUT, 'LLM returned an empty answer');
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new PipelineError(FAILURE_REASONS.MALFORMED_OUTPUT, 'LLM answer was not valid JSON', {
      cause: err,
    });
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new PipelineError(
      FAILURE_REASONS.MALFORMED_OUTPUT,
      `LLM answer did not match the required shape: ${result.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`
    );
  }
  return result.data;
}

module.exports = { complete, parseAnswer, classify, toStrictJsonSchema };
