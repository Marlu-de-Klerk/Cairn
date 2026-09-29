// Compresses a Blender export into public/models/<Biome>Island.glb (CLAUDE.md asset pipeline: dedupe, prune, weld,
// meshopt). Joining and simplification stay off: the app needs the Lit, Soft and Unlit meshes as separate nodes, and
// the terrace tops must stay exactly at the layout's heights. There are no textures, so no texture resize step.
// Usage: npm run island:pack [-- <biome> [<in.glb>]]   (default: jungle, assets-raw/<Biome>Island.raw.glb)
import { execFileSync } from 'node:child_process'

const biome = process.argv[2] ?? 'jungle'
const name = `${biome[0].toUpperCase()}${biome.slice(1)}Island`
const input = process.argv[3] ?? `assets-raw/${name}.raw.glb`
const output = `public/models/${name}.glb`
const args = ['gltf-transform', 'optimize', input, output, '--compress', 'meshopt', '--join', 'false', '--simplify', 'false', '--flatten', 'false', '--instance', 'false', '--palette', 'false']
console.log(`> npx ${args.join(' ')}`)
execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' })
