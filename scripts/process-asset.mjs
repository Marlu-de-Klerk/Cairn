#!/usr/bin/env node
// scripts/process-asset.mjs
// Wraps the gltf-transform + gltfjsx pipeline spec §8 mandates for every
// model: dedupe, prune, weld, compress, resize textures, then generate a
// typed React component. Never call gltf-transform or gltfjsx directly —
// this script is the one place the pipeline order is defined.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const [, , input, outputDir, componentName] = process.argv

if (!input || !outputDir || !componentName) {
  console.error('Usage: npm run assets:process -- <input.glb> <outputDir> <ComponentName>')
  process.exit(1)
}

mkdirSync(outputDir, { recursive: true })
const compressed = path.join(outputDir, `${componentName}.glb`)

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`)
  // npx resolves to npx.cmd on Windows; spawnSync can't exec a .cmd file
  // directly (EINVAL) or find it on PATH without shell resolution (ENOENT).
  // Every arg here is a fixed literal or a path we constructed ourselves —
  // nothing attacker-controlled — so shell:true's arg-concatenation is safe.
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
}

// One gltf-transform invocation, in the order spec §8 lists: dedupe, prune,
// weld, then compress. resize is a separate transform since gltf-transform's
// CLI doesn't chain `resize` inside `optimize` for texture-only sizing.
run('npx', [
  'gltf-transform',
  'optimize',
  input,
  compressed,
  '--compress',
  'meshopt',
  '--texture-size',
  '512',
  '--texture-compress',
  'webp',
])

run('npx', ['gltfjsx', compressed, '--output', path.join(outputDir, `${componentName}.tsx`), '--types', '--component', componentName])

console.log(`\nDone. Review ${outputDir}/${componentName}.tsx before wiring it in — gltfjsx output needs the component name and export checked, and any node names referenced by the scatter/instancing code.`)
