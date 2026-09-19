/**
 * Smoke client: connects with a minted token, drives briefly, then stops so the
 * watchdog can trip. Run against `npm run dev:robot`.
 *
 * Usage:
 *   npm run smoke -w robot
 *   npm run smoke -w robot -- --second   # expect seat refusal
 */
import {
  PROTOCOL_VERSION,
  TOKEN_ALG,
  TOKEN_ISSUER,
  TOKEN_TTL_S,
  WS_PATH,
  audienceFor,
  parseServerMessage,
} from '@teleop/protocol';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { importJWK, SignJWT } from 'jose';
import WebSocket from 'ws';

function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const i = trimmed.indexOf('=');
    if (i < 0) {
      continue;
    }
    const key = trimmed.slice(0, i);
    const value = trimmed.slice(i + 1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));

const robotId = process.env['ROBOT_ID'];
const privateJwk =
  process.env['SMOKE_PRIVATE_JWK'] ?? process.env['TOKEN_SIGNING_PRIVATE_JWK'];
const origin = process.env['SMOKE_ORIGIN'] ?? 'http://localhost:3000';
const base =
  process.env['SMOKE_WS_URL'] ??
  `ws://127.0.0.1:${process.env['PORT'] ?? '8080'}${WS_PATH}`;
const second = process.argv.includes('--second');

async function mintToken(sid: string): Promise<string> {
  if (!robotId || !privateJwk) {
    throw new Error(
      'Need ROBOT_ID and SMOKE_PRIVATE_JWK (or TOKEN_SIGNING_PRIVATE_JWK) in env. ' +
        'Put the web private JWK in SMOKE_PRIVATE_JWK for local smoke tests only.',
    );
  }
  const key = await importJWK(
    JSON.parse(privateJwk) as import('jose').JWK,
    TOKEN_ALG,
  );
  const nowS = Math.floor(Date.now() / 1000);
  return new SignJWT({ perm: 'driver', sid })
    .setProtectedHeader({ alg: TOKEN_ALG })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(audienceFor(robotId))
    .setSubject('smoke@example.com')
    .setJti(randomUUID())
    .setIssuedAt(nowS)
    .setExpirationTime(nowS + TOKEN_TTL_S)
    .sign(key);
}

async function main(): Promise<void> {
  const sid = randomUUID();
  const token = await mintToken(sid);
  console.log(`connecting to ${base} (second=${String(second)})`);

  const ws = new WebSocket(base, { origin });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  ws.on('message', (data) => {
    const parsed = parseServerMessage(data.toString('utf8'));
    if (parsed.ok) {
      console.log('←', parsed.value.type, parsed.value);
    } else {
      console.log('← bad', parsed.error);
    }
  });

  ws.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      type: 'hello',
      token,
      clientSessionId: sid,
      wantControl: true,
    }),
  );

  await new Promise((r) => setTimeout(r, 300));

  if (second) {
    console.log(
      'second client: holding connection; expect viewer / DRIVER_BUSY',
    );
    await new Promise((r) => setTimeout(r, 2000));
    ws.close();
    return;
  }

  console.log('sending drive commands for ~1s…');
  const started = Date.now();
  while (Date.now() - started < 1000) {
    ws.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: 'drive',
        throttle: 0.5,
        steer: 0,
        speed: 40,
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log('stopping commands — watchdog should brake then coast (~300ms)');
  await new Promise((r) => setTimeout(r, 1000));
  ws.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
