/**
 * Minimal ZIP container reader/writer — just enough to read/write the OOXML
 * (.xlsx) package format. No external zip dependency: uses node:zlib's raw
 * deflate/inflate directly, and implements the ZIP local-file-header / central
 * directory / EOCD structures by hand. Not a general-purpose zip library —
 * scoped deliberately to what XLSX needs (STORED or DEFLATE, no encryption,
 * no zip64, no multi-disk archives).
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] ?? 0;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dt = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: dt };
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

export interface ReadZipOptions {
  /** Refuse to decompress a single entry larger than this (bytes). Defaults to 200MB. */
  maxEntrySize?: number;
  /** Refuse an archive whose total decompressed size exceeds this (bytes). Defaults to 500MB. */
  maxTotalSize?: number;
  /** Refuse an archive declaring more than this many entries. Defaults to 10,000. */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRY_SIZE = 200 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_SIZE = 500 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 10_000;

export function readZip(buf: Buffer, opts: ReadZipOptions = {}): ZipEntry[] {
  const maxEntrySize = opts.maxEntrySize ?? DEFAULT_MAX_ENTRY_SIZE;
  const maxTotalSize = opts.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;

  // Locate End Of Central Directory by scanning from the end for its signature.
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file (EOCD not found)');

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  if (entryCount > maxEntries) {
    throw new Error(`ZIP declares ${entryCount} entries, exceeding the configured limit of ${maxEntries} (possible zip bomb)`);
  }
  let centralOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let totalDecompressed = 0;

  for (let i = 0; i < entryCount; i++) {
    if (centralOffset < 0 || centralOffset + 46 > buf.length) {
      throw new Error('Corrupt central directory (offset out of bounds)');
    }
    if (buf.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('Corrupt central directory');
    const method = buf.readUInt16LE(centralOffset + 10);
    const compSize = buf.readUInt32LE(centralOffset + 20);
    const uncompSize = buf.readUInt32LE(centralOffset + 24);
    const nameLen = buf.readUInt16LE(centralOffset + 28);
    const extraLen = buf.readUInt16LE(centralOffset + 30);
    const commentLen = buf.readUInt16LE(centralOffset + 32);
    const localOffset = buf.readUInt32LE(centralOffset + 42);

    if (uncompSize > maxEntrySize) {
      throw new Error(`ZIP entry declares uncompressed size ${uncompSize} bytes, exceeding the per-entry limit of ${maxEntrySize} (possible zip bomb)`);
    }
    totalDecompressed += uncompSize;
    if (totalDecompressed > maxTotalSize) {
      throw new Error(`ZIP archive's total declared uncompressed size exceeds the configured limit of ${maxTotalSize} bytes (possible zip bomb)`);
    }

    if (centralOffset + 46 + nameLen > buf.length) throw new Error('Corrupt central directory (name out of bounds)');
    const name = buf.toString('utf8', centralOffset + 46, centralOffset + 46 + nameLen);

    if (localOffset < 0 || localOffset + 30 > buf.length) throw new Error('Corrupt local file header (offset out of bounds)');
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart < 0 || dataStart + compSize > buf.length) throw new Error('Corrupt entry data (out of bounds)');
    const compData = buf.subarray(dataStart, dataStart + compSize);
    // maxOutputLength is enforced by zlib itself against the *actual* decompressed
    // bytes produced — this is the real defense; the declared-size checks above are
    // a fast-fail for obviously-hostile headers, not a substitute for this.
    const data = method === 8 ? inflateRawSync(compData, { maxOutputLength: maxEntrySize }) : Buffer.from(compData);

    entries.push({ name, data });
    centralOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
