// Shared copy helpers for the category pages, so counts read the same
// everywhere. A department with no products yet says "New" instead of a
// discouraging "0 items".

export function plural(n, word) {
  if (n === 1) return `1 ${word}`;
  const many = word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`;
  return `${n} ${many}`;
}

export function countLabel(n) {
  return n > 0 ? plural(n, 'item') : 'New';
}
