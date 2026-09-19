/**
 * Prompts for a password (hidden) and user fields, prints a scrypt hash and a
 * ready AUTH_USERS_JSON entry. Never takes the password as a CLI argument.
 *
 * Usage: npm run user:hash
 *
 * Uses the same password module as the web server (`web/src/server/auth/password.ts`).
 */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { driverViewerSchema, robotSlugSchema } from '../packages/protocol/src/index.ts';
import { authUserSchema } from '../web/src/lib/env.schemas.ts';
import { hashPassword } from '../web/src/server/auth/password.ts';

async function promptHidden(question: string): Promise<string> {
  output.write(question);
  return await new Promise<string>((resolve, reject) => {
    const wasRaw = input.isRaw;
    const chunks: string[] = [];

    const cleanup = (): void => {
      input.off('data', onData);
      if (typeof input.setRawMode === 'function') {
        input.setRawMode(wasRaw);
      }
      input.pause();
    };

    const onData = (data: Buffer): void => {
      const text = data.toString('utf8');
      for (const char of text) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          cleanup();
          output.write('\n');
          resolve(chunks.join(''));
          return;
        }
        if (char === '\u0003') {
          cleanup();
          reject(new Error('interrupted'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          chunks.pop();
          continue;
        }
        if (char < ' ' && char !== '\t') {
          continue;
        }
        chunks.push(char);
      }
    };

    if (typeof input.setRawMode === 'function') {
      input.setRawMode(true);
    }
    input.resume();
    input.on('data', onData);
  });
}

async function promptLine(
  rl: readline.Interface,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    const email = await promptLine(rl, 'Email: ');
    if (!email) {
      throw new Error('email is required');
    }

    const permissionRaw = await promptLine(
      rl,
      'Permission (driver|viewer) [driver]: ',
    );
    const permission = driverViewerSchema.parse(
      permissionRaw === '' ? 'driver' : permissionRaw,
    );

    const robotsRaw = await promptLine(
      rl,
      'Robots (comma-separated slugs, or * for all) [*]: ',
    );
    const robotsField =
      robotsRaw === '' || robotsRaw === '*'
        ? '*'
        : robotsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

    if (robotsField !== '*') {
      for (const slug of robotsField) {
        robotSlugSchema.parse(slug);
      }
    }

    // Close readline before raw-mode password so the two do not fight over stdin.
    rl.close();

    const password = await promptHidden('Password (input hidden): ');
    if (password.length === 0) {
      throw new Error('password must not be empty');
    }
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      throw new Error('passwords do not match');
    }

    const passwordHash = await hashPassword(password);
    const user = authUserSchema.parse({
      email,
      passwordHash,
      permission,
      robots: robotsField,
    });

    console.log('');
    console.log('# passwordHash (for AUTH_USERS_JSON)');
    console.log(passwordHash);
    console.log('');
    console.log('# Ready user object — paste into the AUTH_USERS_JSON array:');
    console.log(JSON.stringify(user, null, 2));
    console.log('');
    console.log(
      '# Single-line for web/.env.local (every $ already escaped as \\$):',
    );
    console.log(
      `AUTH_USERS_JSON=${JSON.stringify([user]).replaceAll('$', '\\$')}`,
    );
    console.log('');
    console.log(
      '# Reminder: changing AUTH_USERS_JSON in Vercel requires a redeploy.',
    );
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`user:hash failed: ${message}`);
  process.exitCode = 1;
});
