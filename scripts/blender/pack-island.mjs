// Compresses the Blender export into public/models/JungleIsland.glb (CLAUDE.md asset pipeline: dedupe, prune, weld,
// meshopt). Joining and simplification stay off: the app needs the Lit and Unlit meshes as separate nodes, and the
// terrace tops must stay exactly at the layout's heights. There are no textures, so no texture resize step.
// Usage: npm run island:pack [-- <in.glb>]
import { execFileSync } from 'node:child_process'

const input = process.argv[2] ?? 'assets-raw/JungleIsland.raw.glb'
const output = 'public/models/JungleIsland.glb'
const args = ['gltf-transform', 'optimize', input, output, '--compress', 'meshopt', '--join', 'false', '--simplify', 'false', '--flatten', 'false', '--instance', 'false', '--palette', 'false']
console.log(`> npx ${args.join(' ')}`)
execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' })
