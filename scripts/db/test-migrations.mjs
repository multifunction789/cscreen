// Replays supabase/migrations/*.sql on a throwaway in-memory Postgres (PGlite)
// on top of supabase/tests/supabase-stub.sql, twice (to prove the files are
// replay-safe), then runs every supabase/tests/*.test.sql file.
//
// usage: node scripts/db/test-migrations.mjs
// A test file is plain SQL; it fails by raising an exception.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mig = join(root, 'supabase', 'migrations')
const tests = join(root, 'supabase', 'tests')

// PGlite has no pg_stat_statements / pgcrypto / uuid-ossp; gen_random_uuid() is core.
const local = sql => sql.replace(/^create extension if not exists .*$/gim, '-- (extension skipped in local test)')

const db = new PGlite()
let failed = 0
const run = async (label, sql) => {
  try { await db.exec(sql); console.log('ok   ', label) }
  catch (e) { failed++; console.log('FAIL ', label, '\n      ', e.message, e.position ? `(at ${e.position})` : '', e.where ? '\n       where: ' + e.where.split('\n').slice(0, 3).join(' | ') : '') }
}

await run('supabase stub', readFileSync(join(tests, 'supabase-stub.sql'), 'utf8'))
const files = readdirSync(mig).filter(f => f.endsWith('.sql')).sort()
for (const pass of [1, 2]) {
  for (const f of files) await run(`migration ${f} (pass ${pass})`, local(readFileSync(join(mig, f), 'utf8')))
}
for (const f of readdirSync(tests).filter(f => f.endsWith('.test.sql')).sort()) {
  await run(`test ${f}`, readFileSync(join(tests, f), 'utf8'))
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
