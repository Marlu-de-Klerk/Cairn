import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const DEMO_EMAIL = 'demo@cairn.local'
const DEMO_PASSWORD = 'CairnDemo123!'
const DEMO_SEED = 20260101 // fixed, so the demo archipelago's layout never changes between runs

// Golden-angle spiral, duplicated here in spirit only (see src/lib/archipelago.ts) —
// this script is plain Node/ESM with no build step, so it re-implements the same
// formula rather than importing TS. Keep the two in sync if the formula ever changes.
const GOLDEN_ANGLE = 2.39996
const BASE_RADIUS = 8
const ANGLE_JITTER_AMPLITUDE = 0.12
const RADIUS_JITTER_AMPLITUDE = 0.4

function hash01(seed, index, salt) {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453
  return x - Math.floor(x)
}

function islandPosition(index, seed) {
  const angleJitter = (hash01(seed, index, 1) * 2 - 1) * ANGLE_JITTER_AMPLITUDE
  const radiusJitter = (hash01(seed, index, 2) * 2 - 1) * RADIUS_JITTER_AMPLITUDE
  const angle = index * GOLDEN_ANGLE + angleJitter
  const radius = BASE_RADIUS * Math.sqrt(index + 1) + radiusJitter
  const rotation = hash01(seed, index, 3) * 2 * Math.PI
  return { x: radius * Math.cos(angle), z: radius * Math.sin(angle), rotation }
}

async function findOrCreateUser(email) {
  // Admin listUsers has no filter-by-email; page through (this project has
  // a handful of users at most for the foreseeable future) rather than add
  // a second SDK call shape just for this lookup.
  const { data: existing, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw listError
  const found = existing.users.find((u) => u.email === email)
  if (found) return found.id

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (createError) throw createError
  return created.user.id
}

async function main() {
  // Defaults to the fixed demo account (spec §10). The app has no password
  // sign-in UI (magic link + Google only), so a script-created demo account
  // can't actually be signed into through the app — pass a real email
  // you can already sign into (`npm run seed -- you@example.com`) to seed
  // that account instead, for live manual verification.
  const targetEmail = process.argv[2] ?? DEMO_EMAIL
  const userId = await findOrCreateUser(targetEmail)
  console.log(
    targetEmail === DEMO_EMAIL
      ? `Demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (id ${userId}) — no password sign-in UI exists, so this account is for data/API inspection only, not browser sign-in.`
      : `Seeded into existing account: ${targetEmail} (id ${userId})`,
  )

  // The new-user trigger (migration 0002) already created a profiles row.
  // Overwrite its archipelago_seed with our fixed value so the layout is stable.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ archipelago_seed: DEMO_SEED })
    .eq('id', userId)
  if (profileError) throw profileError

  // Idempotent: wipe this demo user's existing goals (cascades to
  // milestones/progress_entries/cheers) before re-seeding, so re-running
  // this script always produces the same clean state.
  const { error: deleteError } = await admin.from('goals').delete().eq('user_id', userId)
  if (deleteError) throw deleteError

  const goalsToSeed = [
    {
      title: 'Run 10K',
      description: 'Couch to 10K, one run at a time.',
      biome: 'jungle',
      kind: 'numeric',
      unit: 'km',
      target_value: 10,
      current_value: 3.5,
      milestones: [
        { title: '2 km', target_value: 2, completed: true },
        { title: '5 km', target_value: 5, completed: false },
        { title: '8 km', target_value: 8, completed: false },
      ],
      entries: [
        { kind: 'milestone', title: '2 km', value: 2, occurred_at: '2026-08-01' },
        { kind: 'update', title: 'Fastest 3K, 14:02', value: 3, occurred_at: '2026-08-10' },
      ],
    },
    {
      title: 'Read 12 books',
      description: 'One book a month, no excuses.',
      biome: 'tundra',
      kind: 'numeric',
      unit: 'books',
      target_value: 12,
      current_value: 12,
      milestones: [
        { title: '4 books', target_value: 4, completed: true },
        { title: '8 books', target_value: 8, completed: true },
      ],
      entries: [
        { kind: 'milestone', title: '4 books', value: 4, occurred_at: '2026-04-01' },
        { kind: 'milestone', title: '8 books', value: 8, occurred_at: '2026-08-01' },
      ],
      status: 'completed',
      completed_at: '2026-09-01',
    },
    {
      title: 'Learn to surf',
      description: "Stand up, don't fall off.",
      biome: 'reef',
      kind: 'checklist',
      milestones: [
        { title: 'Take a lesson', target_value: null, completed: true },
        { title: 'Stand up once', target_value: null, completed: false },
      ],
      entries: [{ kind: 'milestone', title: 'Take a lesson', value: null, occurred_at: '2026-07-15' }],
    },
  ]

  for (let i = 0; i < goalsToSeed.length; i++) {
    const seed = goalsToSeed[i]
    const position = islandPosition(i, DEMO_SEED)

    const { data: goal, error: goalError } = await admin
      .from('goals')
      .insert({
        user_id: userId,
        title: seed.title,
        description: seed.description,
        biome: seed.biome,
        kind: seed.kind,
        unit: seed.unit ?? null,
        start_value: 0,
        target_value: seed.target_value ?? null,
        current_value: seed.current_value ?? 0,
        status: seed.status ?? 'active',
        completed_at: seed.completed_at ?? null,
        island_x: position.x,
        island_z: position.z,
        island_rotation: position.rotation,
      })
      .select()
      .single()
    if (goalError) throw goalError

    const milestoneIdByTitle = {}
    for (let sortOrder = 0; sortOrder < seed.milestones.length; sortOrder++) {
      const m = seed.milestones[sortOrder]
      const { data: milestone, error: milestoneError } = await admin
        .from('milestones')
        .insert({
          goal_id: goal.id,
          title: m.title,
          target_value: m.target_value,
          sort_order: sortOrder + 1,
          completed_at: m.completed ? new Date().toISOString() : null,
        })
        .select()
        .single()
      if (milestoneError) throw milestoneError
      milestoneIdByTitle[m.title] = milestone.id
    }

    for (const e of seed.entries) {
      const { error: entryError } = await admin.from('progress_entries').insert({
        goal_id: goal.id,
        milestone_id: e.kind === 'milestone' ? milestoneIdByTitle[e.title] ?? null : null,
        kind: e.kind,
        title: e.title,
        value: e.value,
        occurred_at: e.occurred_at,
      })
      if (entryError) throw entryError
    }

    console.log(`Seeded "${seed.title}" (${seed.biome}) at (${position.x.toFixed(1)}, ${position.z.toFixed(1)})`)
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
