/**
 * Placeholder for migration already applied in DB (file was missing).
 * Keeps knex_migrations in sync with migration directory.
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    // No-op: migration was applied when file existed
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    // No-op
}
