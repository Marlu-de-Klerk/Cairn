// scripts/db-types.mjs
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const projectRef = process.env.SUPABASE_PROJECT_REF
if (!projectRef) {
  console.error('Missing SUPABASE_PROJECT_REF in .env')
  process.exit(1)
}

const result = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--project-id', projectRef, '--schema', 'public'],
  { encoding: 'utf8', shell: process.platform === 'win32' },
)

if (result.status !== 0) {
  console.error(result.stderr)
  process.exit(result.status ?? 1)
}

writeFileSync('src/lib/database.types.ts', result.stdout)
console.log('Wrote src/lib/database.types.ts')
