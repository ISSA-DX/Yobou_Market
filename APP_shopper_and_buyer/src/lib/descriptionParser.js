// parseFeatures — split a free-text product description into a list
// of bullet points for the "About this item" tab on the PDP.
//
// The admin/partner product form writes `Product.description` as a
// plain textarea string. Operators occasionally use one of three
// bullet markers (`-`, `•`, `*`) at the start of a line, sometimes
// with leading whitespace. We don't want to push them toward a new
// schema for this round — heuristics only.
//
// Returns:
//   { mode: 'empty', lines: [] }                        when the input is empty
//   { mode: 'paragraph', text: '…' }                    single paragraph (no \n)
//   { mode: 'bullets',   lines: ['…', '…'] }            one or more bullet lines
//
// A single non-empty line with no newline is treated as a paragraph
// so a typical one-sentence product description doesn't render as a
// lonely 1-item list. Two or more lines, or a line with a bullet
// marker, are rendered as bullets.
const BULLET_PREFIX = /^\s*[-•*]\s+/;

export function parseFeatures(description) {
  if (!description || typeof description !== 'string') {
    return { mode: 'empty', lines: [] };
  }
  if (!description.includes('\n')) {
    return { mode: 'paragraph', text: description.trim() };
  }
  const lines = description
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(BULLET_PREFIX, ''));
  if (lines.length === 0) return { mode: 'empty', lines: [] };
  // Single line with no bullet marker = paragraph. The shape mirrors
  // a no-newline description so the caller can fall through to the
  // same render path.
  if (lines.length === 1 && !BULLET_PREFIX.test(description)) {
    return { mode: 'paragraph', text: lines[0] };
  }
  return { mode: 'bullets', lines };
}
