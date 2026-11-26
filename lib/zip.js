// Minimal, zero-dependency ZIP reader & writer using Node's built-in zlib.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Create a ZIP archive buffer from an array of `{ name, data }` entries.
 * Uses deflate when smaller than stored bytes.
 */
export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = String(entry.name).replace(/\\/g, "/").replace(/^\/+/, "");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const deflated = zlib.deflateRawSync(raw);
    const useDeflate = deflated.length < raw.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : raw;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 flag
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x5421, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    localParts.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x5421, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);

    centralParts.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/**
 * Extract a ZIP buffer into `destDir`.
 * Supports stored (0) and deflate (8) entries, prevents path traversal.
 */
export function extractZip(buf, destDir, { mapPath } = {}) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let eocdPos = -1;
  const minPos = Math.max(0, data.length - 65557);
  for (let i = data.length - 22; i >= minPos; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error("Invalid ZIP archive (missing EOCD)");

  const totalEntries = data.readUInt16LE(eocdPos + 10);
  const cdOffset = data.readUInt32LE(eocdPos + 16);
  let ptr = cdOffset;
  const written = [];
  const base = path.resolve(destDir);
  fs.mkdirSync(base, { recursive: true });

  for (let i = 0; i < totalEntries; i++) {
    if (data.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry");
    }
    const method = data.readUInt16LE(ptr + 10);
    const compSize = data.readUInt32LE(ptr + 20);
    const nameLen = data.readUInt16LE(ptr + 28);
    const extraLen = data.readUInt16LE(ptr + 30);
    const commentLen = data.readUInt16LE(ptr + 32);
    const localOffset = data.readUInt32LE(ptr + 42);
    const rawName = data.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith("/")) continue;
    const mapped = mapPath ? mapPath(rawName) : rawName;
    if (!mapped) continue;

    const cleanRel = mapped.replace(/\\/g, "/").replace(/^\/+/, "");
    const target = path.resolve(base, cleanRel);
    if (!target.startsWith(base + path.sep)) continue;

    if (data.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${rawName}`);
    }
    const lhNameLen = data.readUInt16LE(localOffset + 26);
    const lhExtraLen = data.readUInt16LE(localOffset + 28);
    const contentStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const comp = data.subarray(contentStart, contentStart + compSize);

    let out;
    if (method === 0) out = comp;
    else if (method === 8) out = zlib.inflateRawSync(comp);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${rawName}`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, out);
    written.push(cleanRel);
  }
  return written;
}
