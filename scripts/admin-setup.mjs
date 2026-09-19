// Sets up admin credentials in .env.local:
//   ADMIN_PASSWORD_HASH  — scrypt hash of the password you type (input is hidden)
//   ADMIN_SESSION_SECRET — random signing key for the session cookie (kept if it already exists)
//   CRON_SECRET          — random bearer token for /api/cron/daily (kept if it already exists)
//
// Usage (in PowerShell / Windows Terminal, not Git Bash):
//   bun run admin:setup                           # set/replace the password
//   bun run admin:setup -- --rotate-secrets       # also regenerate both secrets (logs out all sessions)
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { hashPassword } from '../lib/auth/password.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(__dirname, '..', '.env.local');
const MIN_LENGTH = 12;

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('Run this in an interactive terminal (PowerShell or Windows Terminal) so the password stays hidden.'));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    let value = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.replace(/\s*$/, '')}\n${line}\n`;
}

function hasKey(content, key) {
  return new RegExp(`^${key}=\\S+`, 'm').test(content);
}

async function main() {
  const rotate = process.argv.includes('--rotate-secrets');

  const password = await promptHidden('New admin password: ');
  if (password.length < MIN_LENGTH) throw new Error(`Use at least ${MIN_LENGTH} characters.`);
  const confirm = await promptHidden('Repeat password: ');
  if (confirm !== password) throw new Error('Passwords do not match.');

  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  env = upsertEnv(env, 'ADMIN_PASSWORD_HASH', await hashPassword(password));

  const written = ['ADMIN_PASSWORD_HASH'];
  for (const key of ['ADMIN_SESSION_SECRET', 'CRON_SECRET']) {
    if (rotate || !hasKey(env, key)) {
      env = upsertEnv(env, key, randomBytes(32).toString('base64url'));
      written.push(key);
    }
  }

  fs.writeFileSync(ENV_FILE, env);
  console.log(`Updated .env.local: ${written.join(', ')}`);
  console.log('Copy the same values into your Vercel project (Production) env vars before deploying.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
