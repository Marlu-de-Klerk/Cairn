import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'RLS tests need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env. See CLAUDE.md.',
  )
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

async function createSignedInTestUser(label: string): Promise<TestUser> {
  const email = `cairn-rls-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = `Test-${Math.random().toString(36).slice(2)}!`

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`failed to create test user ${label}: ${error?.message}`)
  }

  const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`failed to sign in test user ${label}: ${signInError.message}`)
  }

  return { id: data.user.id, email, client }
}

describe('row-level security', () => {
  let userA: TestUser
  let userB: TestUser

  beforeAll(async () => {
    userA = await createSignedInTestUser('a')
    userB = await createSignedInTestUser('b')
  })

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
  })

  async function insertGoal(owner: TestUser, overrides: Partial<Record<string, unknown>> = {}) {
    const { data, error } = await owner.client
      .from('goals')
      .insert({
        user_id: owner.id,
        title: 'Run 10K',
        biome: 'jungle',
        kind: 'numeric',
        unit: 'km',
        target_value: 10,
        island_x: 0,
        island_z: 0,
        island_rotation: 0,
        ...overrides,
      })
      .select()
      .single()

    if (error || !data) {
      throw new Error(`failed to insert goal: ${error?.message}`)
    }
    return data as { id: string }
  }

  it('lets the owner read their own private goal', async () => {
    const goal = await insertGoal(userA)

    const { data, error } = await userA.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('hides a private goal from another user', async () => {
    const goal = await insertGoal(userA)

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('still hides a goal marked public when the owner profile is not public', async () => {
    const goal = await insertGoal(userA, { is_public: true })

    const { data: profile } = await userA.client
      .from('profiles')
      .select('is_public')
      .eq('id', userA.id)
      .single()
    expect(profile?.is_public).toBe(false)

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('reveals a goal only when both goal.is_public and profile.is_public are true', async () => {
    const { error: profileError } = await userA.client
      .from('profiles')
      .update({ is_public: true })
      .eq('id', userA.id)
    expect(profileError).toBeNull()

    const goal = await insertGoal(userA, { is_public: true })

    const { data, error } = await userB.client.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    await userA.client.from('profiles').update({ is_public: false }).eq('id', userA.id)
  })

  it('hides even a fully public goal from a genuinely unauthenticated client', async () => {
    await userA.client.from('profiles').update({ is_public: true }).eq('id', userA.id)
    const goal = await insertGoal(userA, { is_public: true })

    const anonClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)
    const { data, error } = await anonClient.from('goals').select().eq('id', goal.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)

    await userA.client.from('profiles').update({ is_public: false }).eq('id', userA.id)
  })

  it('hides milestones and progress entries on a private goal from another user', async () => {
    const goal = await insertGoal(userA)

    const { data: milestone, error: milestoneError } = await userA.client
      .from('milestones')
      .insert({ goal_id: goal.id, title: '2 km', target_value: 2, sort_order: 1 })
      .select()
      .single()
    expect(milestoneError).toBeNull()

    const { data: entry, error: entryError } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: goal.id, kind: 'update', title: 'Fastest 3K', value: 3 })
      .select()
      .single()
    expect(entryError).toBeNull()

    const { data: milestonesSeenByB } = await userB.client
      .from('milestones')
      .select()
      .eq('id', milestone!.id)
    expect(milestonesSeenByB).toHaveLength(0)

    const { data: entriesSeenByB } = await userB.client
      .from('progress_entries')
      .select()
      .eq('id', entry!.id)
    expect(entriesSeenByB).toHaveLength(0)
  })

  it('lets another user cheer an entry on a fully public goal, but not one they cannot read', async () => {
    await userA.client.from('profiles').update({ is_public: true }).eq('id', userA.id)
    const publicGoal = await insertGoal(userA, { is_public: true })
    const privateGoal = await insertGoal(userA)

    const { data: publicEntry } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: publicGoal.id, kind: 'update', title: 'Fastest 3K', value: 3 })
      .select()
      .single()
    const { data: privateEntry } = await userA.client
      .from('progress_entries')
      .insert({ goal_id: privateGoal.id, kind: 'update', title: 'Secret split', value: 3 })
      .select()
      .single()

    const { error: cheerOnPublicError } = await userB.client
      .from('cheers')
      .insert({ entry_id: publicEntry!.id, user_id: userB.id })
    expect(cheerOnPublicError).toBeNull()

    const { error: cheerOnPrivateError } = await userB.client
      .from('cheers')
      .insert({ entry_id: privateEntry!.id, user_id: userB.id })
    expect(cheerOnPrivateError).not.toBeNull()

    await userA.client.from('profiles').update({ is_public: false }).eq('id', userA.id)
  })
})
