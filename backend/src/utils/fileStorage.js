// Where the original PDF/DOCX lives. The database keeps only the path (doc 02).
//
// The filename is ALWAYS one we generate. The uploaded name never reaches this
// module - the guard drops it (doc 04) - because names like `../../config` are an
// attempt to escape our folder. A random name cannot traverse anywhere.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/env');
const { EXTENSION } = require('./fileType');

// Relative paths are resolved against the backend root, like the database file is,
// so storage never depends on the process working directory.
const UPLOADS_DIR = path.isAbsolute(config.uploadsDir)
  ? config.uploadsDir
  : path.resolve(__dirname, '../../', config.uploadsDir);

// The stored path goes into the DB with forward slashes on every platform, so a
// row written on Windows still reads correctly on the Linux box it deploys to.
function toPosix(p) {
  return p.split(path.win32.sep).join(path.posix.sep);
}

/** A name with no attacker-controlled part in it at all. */
function generateStoredName(kind) {
  return `${Date.now()}-${crypto.randomUUID()}${EXTENSION[kind] || ''}`;
}

/**
 * Write the upload to disk under a generated name.
 * @param {Buffer} buffer the bytes the guard already accepted
 * @param {'pdf'|'docx'} kind decided by content, not by the uploaded name
 * @returns {Promise<{storedName: string, filePath: string, absolutePath: string}>}
 *          `filePath` is what goes in the DB - relative, so the row survives a move.
 */
async function saveResumeFile(buffer, kind) {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

  const storedName = generateStoredName(kind);
  const absolutePath = path.join(UPLOADS_DIR, storedName);
  await fs.promises.writeFile(absolutePath, buffer);

  return {
    storedName,
    absolutePath,
    filePath: path.posix.join(toPosix(config.uploadsDir), storedName),
  };
}

module.exports = { saveResumeFile, generateStoredName, UPLOADS_DIR };
