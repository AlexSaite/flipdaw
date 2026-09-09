#!/usr/bin/env node
/**
 * FlipDAW dev bridge - WebSocket <-> UDP.
 * The browser talks OSC over WebSocket (default ws://localhost:9001);
 * this tool forwards raw OSC packets to a DAW listening over UDP
 * (default 127.0.0.1:9000) and relays replies back to every browser.
 *
 *   node tools/osc-ws-bridge.mjs [--udpPort 9000] [--udpTargetPort 9000] [--wsPort 9001] [--udpHost 127.0.0.1]
 */

import dgram from 'node:dgram';
import { WebSocketServer } from 'ws';

const args = parseArgs(process.argv.slice(2));
const UDP_HOST = args.udpHost ?? '127.0.0.1';
const UDP_PORT = Number(args.udpPort ?? 9000);
const UDP_TARGET = Number(args.udpTargetPort ?? UDP_PORT);
const BIND_HOST = args.bindHost ?? UDP_HOST;
const WS_PORT = Number(args.wsPort ?? 9001);

const udp = dgram.createSocket('udp4');
const sockets = new Set();

function log(prefix, bytes) {
  const hex = Buffer.from(bytes).subarray(0, 24).toString('hex');
  console.log(`${new Date().toISOString()} [${prefix}] ${bytes.length}B ${hex}${bytes.length > 24 ? '...' : ''}`);
}

udp.on('message', (msg, rinfo) => {
  log(`udp ${rinfo.address}:${rinfo.port}`, msg);
  const buf = Buffer.from(msg);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(buf);
  }
});

udp.on('error', (err) => {
  console.error('UDP error:', err.message);
  process.exitCode = 1;
});

udp.bind(UDP_PORT, BIND_HOST);

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  sockets.add(ws);
  console.log(`~ browser connected (${sockets.size} total)`);
  ws.on('message', (data) => {
    log('ws', data);
    udp.send(Buffer.from(data), UDP_TARGET, UDP_HOST, (err) => {
      if (err) console.error('UDP send failed:', err.message);
    });
  });
  ws.on('close', () => sockets.delete(ws));
});

wss.on('listening', () => {
  console.log(`FlipDAW dev bridge - WS :${WS_PORT} <-> UDP ${UDP_HOST}:${UDP_PORT}`);
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i]?.startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

process.on('SIGINT', () => {
  wss.close();
  udp.close();
  process.exit(0);
});