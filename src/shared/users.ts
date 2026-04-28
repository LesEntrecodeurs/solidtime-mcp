import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { UserMapping } from './types.js';

let cache: UserMapping[] | null = null;

export function loadUsers(): UserMapping[] {
  if (cache) return cache;

  const path = resolve(process.env.USERS_CONFIG_PATH || './users.json');
  if (!existsSync(path)) {
    console.error(`[solidtime-mcp] users config not found at ${path}`);
    cache = [];
    return cache;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed?.users) ? parsed.users : [];
    return cache!;
  } catch (err) {
    console.error(`[solidtime-mcp] failed to parse users config:`, err);
    cache = [];
    return cache;
  }
}

export function findUserByDiscordId(discordId: string): UserMapping | undefined {
  return loadUsers().find((u) => u.discordId === discordId);
}

export function findUserByName(name: string): UserMapping | undefined {
  const lower = name.toLowerCase().trim();
  return loadUsers().find((u) => u.name.toLowerCase() === lower);
}

export function findUserByMemberId(memberId: string): UserMapping | undefined {
  return loadUsers().find((u) => u.solidtime.memberId === memberId);
}
