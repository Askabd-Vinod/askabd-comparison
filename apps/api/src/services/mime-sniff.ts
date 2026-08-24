/**
 * RISK-005 fix (docs/security-risk-register.md): real magic-byte content
 * sniffing for document uploads, closing the gap where both real upload
 * routes (`operations-center-routes.ts`'s onboarding-requirement documents,
 * `discovery-intake-routes.ts`'s discovery-source documents) trusted the
 * multipart part's own client-supplied `Content-Type` header for their MIME
 * allowlist check — trivially spoofable (any file can be uploaded with any
 * declared `Content-Type`), giving the allowlist a false sense of
 * enforcement. Real path-traversal protection on both routes was already
 * separately verified real (`local-storage-provider.ts`'s own
 * `validateReference`) — this closes the sibling gap.
 *
 * Covers the union of both routes' real allowlists: PDF, DOCX, PNG, JPEG,
 * TXT, CSV.
 *
 * Honest, disclosed limitations (real, not hidden):
 *  - DOCX is a ZIP archive with a specific internal structure
 *    ([Content_Types].xml, word/document.xml, etc.) — this checks the real
 *    ZIP magic bytes (`PK\x03\x04`), which correctly rejects any non-ZIP
 *    file claiming to be a DOCX, but cannot by itself distinguish a genuine
 *    DOCX from a different ZIP-based format (XLSX, PPTX, or a plain ZIP)
 *    without parsing the archive's internal entries — a real, deliberately
 *    scoped middle ground between "trust the header" and "fully parse
 *    OOXML", matching this session's own "real, bounded fix over
 *    unverified completeness" discipline.
 *  - TXT and CSV have no defined magic-byte signature at all — no format
 *    in existence does. The best a content check can do without full
 *    encoding detection is reject anything that looks unambiguously
 *    binary: a NUL byte anywhere in a real sample, or a match against one
 *    of the OTHER known binary signatures below. A genuinely crafted
 *    binary payload with no NUL bytes in its first few KB could still pass
 *    as "plausible text" — a real, disclosed, inherent limit of
 *    magic-byte sniffing for text formats, not a gap specific to this
 *    implementation.
 */

const BINARY_SIGNATURES: ReadonlyArray<{ mimeType: string; check: (buf: Buffer) => boolean }> = [
  { mimeType: 'application/pdf', check: (buf) => buf.subarray(0, 4).toString('latin1') === '%PDF' },
  { mimeType: 'image/png', check: (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/jpeg', check: (buf) => buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  // DOCX (OOXML) — real ZIP magic bytes. See the module doc comment above
  // for the honest, disclosed limit of this check.
  { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: (buf) => buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
];

const TEXT_LIKE_MIME_TYPES = new Set(['text/plain', 'text/csv']);

const TEXT_SNIFF_SAMPLE_BYTES = 8000;

/**
 * Returns true if `buffer`'s real content plausibly matches
 * `claimedMimeType`, false otherwise. An unrecognized `claimedMimeType` is
 * never trusted (returns false) — callers are expected to check their own
 * allowlist first; this only confirms the CONTENT backs up an already
 * -allowed claim.
 */
export function sniffMimeType(claimedMimeType: string, buffer: Buffer): boolean {
  const binarySignature = BINARY_SIGNATURES.find((s) => s.mimeType === claimedMimeType);
  if (binarySignature) return binarySignature.check(buffer);

  if (TEXT_LIKE_MIME_TYPES.has(claimedMimeType)) {
    // Reject anything that matches a KNOWN binary signature under a false
    // text claim (e.g. a real PNG uploaded declaring text/csv).
    if (BINARY_SIGNATURES.some((s) => s.check(buffer))) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, TEXT_SNIFF_SAMPLE_BYTES));
    return !sample.includes(0); // a NUL byte is a strong, real signal of binary content
  }

  return false; // unrecognized claimed type — never trusted
}
