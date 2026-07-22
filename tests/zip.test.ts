import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZip } from '../src/formats/zip';

test('zip round-trip preserves file names and byte-exact content', () => {
  const entries = [
    { name: 'hello.txt', data: Buffer.from('Hello, world! '.repeat(50)) }, // compressible
    { name: 'dir/small.txt', data: Buffer.from('x') },                     // tiny, likely stored
    { name: 'binary.bin', data: Buffer.from([0, 1, 2, 255, 254, 253, 10, 13]) },
    { name: 'empty.txt', data: Buffer.from('') },
  ];
  const zip = writeZip(entries);
  const readBack = readZip(zip);
  assert.equal(readBack.length, entries.length);
  for (const orig of entries) {
    const got = readBack.find(e => e.name === orig.name);
    assert.ok(got, `entry ${orig.name} should be present`);
    assert.ok(got!.data.equals(orig.data), `entry ${orig.name} content should round-trip exactly`);
  }
});

test('zip throws a clear error on non-zip input', () => {
  assert.throws(() => readZip(Buffer.from('not a zip file')));
});

test('empty archive round-trips', () => {
  const zip = writeZip([]);
  const readBack = readZip(zip);
  assert.deepEqual(readBack, []);
});
