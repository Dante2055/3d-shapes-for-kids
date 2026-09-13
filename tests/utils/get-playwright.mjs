import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwrightModule = null;

// 1. Try standard module resolution ('playwright')
try {
  playwrightModule = await import('playwright');
} catch (e) {}

// 2. Try standard CommonJS require('playwright')
if (!playwrightModule) {
  try {
    playwrightModule = require('playwright');
  } catch (e) {}
}

// 3. Fallback: Search common global npm and nvm locations
if (!playwrightModule) {
  const candidatePaths = [];
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (globalRoot) candidatePaths.push(path.join(globalRoot, 'playwright'));
  } catch {}

  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home) {
      const nvmBase = path.join(home, '.nvm', 'versions', 'node');
      if (fs.existsSync(nvmBase)) {
        for (const ver of fs.readdirSync(nvmBase)) {
          candidatePaths.push(path.join(nvmBase, ver, 'lib', 'node_modules', 'playwright'));
        }
      }
    }
  } catch {}

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        playwrightModule = require(p);
        if (playwrightModule) break;
      } catch {}
    }
  }
}

if (!playwrightModule || !playwrightModule.chromium) {
  throw new Error('Playwright not found. Please install dependencies via `npm install` or install Playwright globally.');
}

export const { chromium } = playwrightModule;
export default playwrightModule;
