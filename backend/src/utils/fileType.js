// Guard 1, the "real file type" rule (doc 04).
//
// The point: someone can rename `virus.exe` to `resume.pdf`, and a browser will
// happily send `Content-Type: application/pdf` for it. The NAME lies and the
// declared MIME TYPE lies - only the bytes tell the truth. So we look at the
// content, and at nothing else.

// A PDF always opens with the literal marker "%PDF-".
const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

// A DOCX is not one file: it is a ZIP archive of XML parts. Every ZIP starts with
// the local-file-header signature "PK\x03\x04".
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

// ...but so do .xlsx, .pptx, .jar and a plain .zip. What makes the archive a WORD
// document is the part named `word/document.xml`. Entry names are stored as plain
// text inside the archive, so finding that name proves it is a Word file and not,
// say, a spreadsheet.
const DOCX_PART = Buffer.from('word/document.xml', 'latin1');

/**
 * What is this file, judged only by its bytes?
 * @param {Buffer} buffer the uploaded bytes
 * @returns {'pdf'|'docx'|null} null = neither, so we refuse it
 */
function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'pdf';

  if (buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    return buffer.includes(DOCX_PART) ? 'docx' : null;
  }

  return null;
}

/** The extension WE give the stored copy - derived from the content, never the upload. */
const EXTENSION = Object.freeze({ pdf: '.pdf', docx: '.docx' });

module.exports = { detectFileType, EXTENSION, PDF_MAGIC, ZIP_MAGIC, DOCX_PART };
