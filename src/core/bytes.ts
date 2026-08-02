/**
 * UTF-8 byte length of a string, without allocating a copy of it.
 *
 * Replaces `Buffer.byteLength(text, 'utf8')` in the CSV, JSON and HTML
 * decoders. `Buffer` is a Node global: in a browser those decoders threw
 * "Buffer is not defined" on their very first guard clause, which is how the
 * Pages demo failed even after the `node:zlib` import chain was avoided.
 *
 * `new TextEncoder().encode(s).length` would also work and is available in
 * both runtimes, but it allocates a byte array as large as the input — a
 * wasteful thing to do when the caller's whole purpose is to reject inputs
 * that are too large to process. This counts instead.
 *
 * Surrogate pairs are handled by consuming both halves at once: a well-formed
 * pair encodes to 4 bytes. A lone surrogate (malformed input) is counted as 3,
 * matching what an encoder emits when it substitutes U+FFFD.
 */
export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // valid surrogate pair -> one 4-byte code point
        i++;
      } else {
        bytes += 3; // lone high surrogate -> replacement character
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
