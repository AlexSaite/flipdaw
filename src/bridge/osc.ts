import type { OscArg, OscArgType, OscMessage } from './bus';

/**
 * Minimal OSC 1.0 codec. Supports the addresses + primitive args we map:
 * int32 (i), float32 (f), string (s). Each element is zero-padded to a
 * multiple of 4 bytes; the type-tag string always starts with ','.
 * ADR-001 stays intact — this never derives musical time.
 */

const PAD = 4;

function paddedLen(n: number): number {
  return Math.ceil(n / PAD) * PAD;
}

function writeString(out: Uint8Array, off: number, s: string): number {
  const bytes = encoder().encode(s);
  const total = paddedLen(bytes.length + 1);
  out.set(bytes, off);
  out[off + bytes.length] = 0;
  for (let p = bytes.length + 1; p < total; p++) out[off + p] = 0;
  return off + total;
}

function readString(bytes: Uint8Array, off: number): { value: string; next: number } {
  let end = off;
  while (end < bytes.length && bytes[end] !== 0) end++;
  const value = decoder().decode(bytes.subarray(off, end));
  return { value, next: off + paddedLen(end - off + 1) };
}

function toInt32Bits(v: number): number[] {
  const b = new DataView(new ArrayBuffer(4));
  b.setInt32(0, v | 0, false);
  return Array.from(new Uint8Array(b.buffer));
}

function toFloat32Bits(v: number): number[] {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, v, false);
  return Array.from(new Uint8Array(b.buffer));
}

let _encoder: TextEncoder | null = null;
function encoder(): TextEncoder {
  _encoder ??= new TextEncoder();
  return _encoder;
}
let _decoder: TextDecoder | null = null;
function decoder(): TextDecoder {
  _decoder ??= new TextDecoder();
  return _decoder;
}

/** Encode (address, args) into a full OSC packet. */
export function encodeOscMessage(msg: OscMessage): Uint8Array<ArrayBuffer> {
  const addr = new Uint8Array(paddedLen(encoder().encode(msg.address).length + 1));
  writeString(addr, 0, msg.address);
  const typeTag = ',' + msg.args.map((a) => a.type).join('');
  const tags = new Uint8Array(paddedLen(encoder().encode(typeTag).length + 1));
  writeString(tags, 0, typeTag);
  const data = concatBytes(msg.args.map(pieceFor));
  return concatBytes([addr, tags, data]);
}

function pieceFor(a: OscArg): Uint8Array<ArrayBuffer> {
  if (a.type === 's') return toStringBytes(a.value as string);
  if (a.type === 'i') return new Uint8Array(toInt32Bits(a.value as number));
  return new Uint8Array(toFloat32Bits(a.value as number));
}

function toStringBytes(s: string): Uint8Array<ArrayBuffer> {
  const b = encoder().encode(s);
  const out = new Uint8Array(paddedLen(b.length + 1));
  out.set(b, 0);
  return out;
}

function concatBytes(parts: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** Decode a single OSC packet; returns null if malformed/unsupported. */
export function decodeOscMessage(bytes: Uint8Array): OscMessage | null {
  const { value: address, next: afterAddr } = readString(bytes, 0);
  if (!address.startsWith('/')) return null;
  const { value: tagStr, next: afterTags } = readString(bytes, afterAddr);
  if (!tagStr.startsWith(',')) return null;
  const tags = tagStr.slice(1);
  const args: OscArg[] = [];
  let off = afterTags;
  for (const t of tags) {
    if (off + 4 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset + off, 4);
    switch (t as OscArgType) {
      case 'i': args.push({ type: 'i', value: view.getInt32(0, false) }); off += 4; break;
      case 'f': args.push({ type: 'f', value: view.getFloat32(0, false) }); off += 4; break;
      case 's': {
        const { value, next } = readString(bytes, off);
        args.push({ type: 's', value });
        off = next;
        break;
      }
      default: return null; // unsupported type tag
    }
  }
  return { address, args };
}