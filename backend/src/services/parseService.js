// STEP 1 of the pipeline: file -> plain text (doc 06).
//
// No LLM here on purpose. Pulling text out of a PDF or a DOCX is a solved,
// deterministic library job; paying a model to do it would be slower, dearer and
// less reliable.
//
// The one judgement this step makes is whether there is any text at all. A scanned
// resume is a PICTURE of text: the file is a perfectly valid PDF, but it contains
// no characters, so extraction comes back empty. We reject it as
// "unreadable_resume" rather than reaching for OCR - the doc's call: it is the
// candidate's responsibility, and OCR is cost and complexity we do not need.
const mammoth = require('mammoth');
const { PipelineError, FAILURE_REASONS } = require('../utils/errors');

// Below this, there is nothing worth sending to the LLM. A handful of stray
// characters from a scan's metadata should not count as a readable resume.
const MIN_USEFUL_CHARS = 30;

/** PDF -> text. pdf-parse hands back one entry per page; we join them. */
async function readPdf(buffer) {
  // Required lazily: pdf-parse pulls in a large PDF engine, and a DOCX-only run
  // should not pay for it.
  // eslint-disable-next-line global-require
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result.pages || []).map((page) => page.text).join('\n\n');
  } finally {
    await parser.destroy();
  }
}

/** DOCX -> text. */
async function readDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

/** Collapse the ragged whitespace both formats produce, without losing paragraphs. */
function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turn the uploaded bytes into the text the LLM will read.
 *
 * @param {Buffer} buffer the file, already proven to be a real PDF/DOCX by the guard
 * @param {'pdf'|'docx'} kind decided from the content, not the filename
 * @returns {Promise<string>} tidy plain text
 * @throws {PipelineError} unreadable_resume - empty, scanned, or corrupt
 */
async function extractText(buffer, kind) {
  let raw;

  try {
    if (kind === 'pdf') raw = await readPdf(buffer);
    else if (kind === 'docx') raw = await readDocx(buffer);
    else throw new Error(`unsupported file kind: ${kind}`);
  } catch (err) {
    // A file that the guard accepted but the parser chokes on is, from the
    // candidate's point of view, exactly the same problem: we cannot read it.
    throw new PipelineError(
      FAILURE_REASONS.UNREADABLE_RESUME,
      `Could not read the ${kind} file: ${err.message}`,
      { cause: err }
    );
  }

  const text = tidy(raw || '');

  if (text.length < MIN_USEFUL_CHARS) {
    throw new PipelineError(
      FAILURE_REASONS.UNREADABLE_RESUME,
      'The file contains no readable text - it looks empty or scanned'
    );
  }

  return text;
}

module.exports = { extractText, tidy, MIN_USEFUL_CHARS };
