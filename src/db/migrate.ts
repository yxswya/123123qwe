import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const sqlite = new Database('sqlite.db')
const db = drizzle(sqlite)

function runMigration() {
    try {
        migrate(db, { migrationsFolder: './drizzle' })
        console.log('✅ Migration completed successfully')
    }
    catch (error) {
        console.error('❌ Migration failed:', error)
    }
    sqlite.close()
}

runMigration()
