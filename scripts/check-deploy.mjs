import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'))
const database = config.d1_databases?.find(binding => binding.binding === 'DB')
if (!database || database.database_id === '00000000-0000-0000-0000-000000000001' || !/^[a-f0-9-]{36}$/i.test(database.database_id)) {
  console.error('Create the production Vigil D1 database, then set its database_id in the main DB binding in wrangler.jsonc. Keep env.local separate.')
  process.exitCode = 1
} else {
  console.log(`Production target: ${config.name}, D1 ${database.database_name}. Local development remains isolated.`)
}
