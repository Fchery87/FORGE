#!/usr/bin/env node
/**
 * Bump all package versions in sync.
 * Usage: node scripts/version.js <version>
 * Example: node scripts/version.js 0.2.0
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('Usage: node scripts/version.js <version>  (e.g. 0.2.0)')
  process.exit(1)
}

const packages = [
  'packages/types',
  'packages/core',
  'packages/cli',
  'packages/adapter-claude-code',
  'packages/adapter-opencode',
  'packages/verifier-test-runner',
  'packages/verifier-playwright',
]

for (const pkg of packages) {
  const path = `${pkg}/package.json`
  const json = JSON.parse(readFileSync(path, 'utf8'))

  // Bump own version
  json.version = version

  // Bump cross-package deps to match
  for (const field of ['dependencies', 'peerDependencies']) {
    if (!json[field]) continue
    for (const [name, _v] of Object.entries(json[field])) {
      if (name.startsWith('@forge-core/')) {
        json[field][name] = `^${version}`
      }
    }
  }

  writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
  console.log(`  ${json.name}@${version}`)
}

// Tag the release
execSync(`git add packages/*/package.json`, { stdio: 'inherit' })

// Only commit if there are staged changes
const diff = execSync('git diff --cached --quiet || echo changed').toString().trim()
if (diff === 'changed') {
  execSync(`git commit -m "chore: release v${version}"`, { stdio: 'inherit' })
} else {
  console.log('  (no version changes to commit)')
}

execSync(`git tag v${version}`, { stdio: 'inherit' })

console.log(`\nTagged v${version}. Push with:`)
console.log(`  git push origin main --tags`)
