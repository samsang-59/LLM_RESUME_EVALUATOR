// Fixtures for the Phase 3 test round.
//
// The resume files here are REAL: a real PDF byte stream and a real OOXML package,
// built in code rather than checked in as binaries. That matters, because the thing
// under test is partly "do we read actual files correctly" - a stubbed parser would
// prove nothing. Building them also lets a test ask for exactly the pathological
// case it needs (a PDF with no text in it, a ZIP that is not a Word document).
//
// The LLM, by contrast, is always faked. Real calls are paid and non-deterministic,
// so the tests feed fixed answers and check that OUR code handles them (doc 11).
const zlib = require('zlib');

/* ============================ PDF ============================ */

/**
 * A minimal but genuinely valid single-page PDF containing `text`.
 * Hand-assembled: header, five objects, an xref table and a trailer - the smallest
 * structure a PDF reader will accept.
 *
 * Each line gets its own Tj at its own y position, exactly as a real document does.
 * One long line would run off the right edge of the page and a text extractor would
 * legitimately drop the overflow.
 */
function makePdf(text) {
  const lines = Array.isArray(text) ? text : String(text).split('\n');
  const escape = (s) => String(s).replace(/([\\()])/g, '\\$1');

  const drawn = lines
    .map((line, i) => (i === 0 ? `(${escape(line)}) Tj` : `T* (${escape(line)}) Tj`))
    .join('\n');
  const content = `BT /F1 12 Tf 16 TL 72 720 Td\n${drawn}\nET`;

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * A valid PDF whose page carries no characters - the shape a SCANNED resume has.
 * The file opens perfectly well; there is simply nothing in it to extract, which is
 * exactly what a photograph of a resume looks like to a text extractor.
 */
function makeScannedPdf() {
  return makePdf('');
}

/* ============================ DOCX ============================ */

let CRC_TABLE = null;

function crc32(buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

/** A ZIP archive (deflate) of `files`, written by hand - enough for an OOXML package. */
function makeZip(files) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(data, 'utf8');
    const deflated = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // "PK\x03\x04"
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    local.push(header, nameBuf, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);

    offset += header.length + nameBuf.length + deflated.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, directory, end]);
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** A real .docx: a ZIP holding the three parts Word needs to open it. */
function makeDocx(paragraphs) {
  const body = []
    .concat(paragraphs)
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('');

  return makeZip([
    {
      name: '[Content_Types].xml',
      data:
        `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      data:
        `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${body}</w:body></w:document>`,
    },
  ]);
}

/** A ZIP that is NOT a Word document - a spreadsheet. Same magic bytes, wrong contents. */
function makeXlsxLikeZip() {
  return makeZip([{ name: 'xl/workbook.xml', data: `${XML_HEADER}<workbook/>` }]);
}

/* ============================ sample content ============================ */

const SAMPLE_RESUME_LINES = [
  'Asha Rao',
  'asha.rao@example.com | +91 90000 00000',
  '',
  'EXPERIENCE',
  'Senior Backend Engineer, Acme (2020 - 2024)',
  'Built and shipped REST APIs with Express and Postgres, containerised with Docker.',
  '',
  'SKILLS',
  'Node.js, SQL, React, Docker, Git',
];

const sampleResumeText = () => SAMPLE_RESUME_LINES.join('\n');
const sampleResumePdf = () => makePdf(SAMPLE_RESUME_LINES);
const sampleResumeDocx = () => makeDocx(SAMPLE_RESUME_LINES.filter(Boolean));

/** What extractionService would return for the sample resume, when all goes well. */
const sampleExtraction = (overrides = {}) => ({
  name: 'Asha Rao',
  phone: '+91 90000 00000',
  email: 'asha.rao@example.com',
  listedSkills: ['Node.js', 'SQL', 'React', 'Docker', 'Git'],
  usedSkills: ['Express', 'Postgres', 'Docker'],
  totalExperienceYears: 4,
  ...overrides,
});

/** A job object shaped exactly as jobRepository hands it to the pipeline. */
const sampleJob = (overrides = {}) => ({
  id: 1,
  title: 'Backend Developer',
  mustHaveSkills: ['Node.js', 'SQL'],
  goodToHaveSkills: ['Docker'],
  requiredExperienceYears: 3,
  matchingMode: 'strict',
  cutoffPercentage: 70,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** A skill-match answer with every requirement matched and grounded evidence. */
const sampleMatchAnswer = (job = sampleJob(), evidence = {}) => ({
  mustHave: job.mustHaveSkills.map((requirement) => ({
    requirement,
    matched: true,
    evidence: evidence[requirement] || requirement,
  })),
  goodToHave: job.goodToHaveSkills.map((requirement) => ({
    requirement,
    matched: true,
    evidence: evidence[requirement] || requirement,
  })),
});

module.exports = {
  makePdf,
  makeScannedPdf,
  makeDocx,
  makeZip,
  makeXlsxLikeZip,
  sampleResumeText,
  sampleResumePdf,
  sampleResumeDocx,
  sampleExtraction,
  sampleJob,
  sampleMatchAnswer,
};
