// scripts/db-push.mjs
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env')
  process.exit(1)
}

const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', dbUrl], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
