/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasSpreadsheets = await knex.schema.hasTable("spreadsheets");
    if (hasSpreadsheets) {
        const hasEnabled = await knex.schema.hasColumn("spreadsheets", "enabled");
        if (!hasEnabled) {
            await knex.schema.alterTable("spreadsheets", (table) => {
                table.boolean("enabled").notNullable().defaultTo(true);
            });
        }
    }

    const hasTariffs = await knex.schema.hasTable("wb_box_tariffs_daily");
    if (hasTariffs) {
        return;
    }

    await knex.schema.createTable("wb_box_tariffs_daily", (table) => {
        table.bigIncrements("id").primary();
        table.date("tariff_date").notNullable();
        table.string("tariff_key", 512).notNullable();

        table.string("warehouse_name", 255).nullable();
        table.bigInteger("warehouse_id").nullable();
        table.string("box_type_name", 255).nullable();
        table.bigInteger("box_type_id").nullable();

        table.decimal("coefficient", 14, 6).nullable();
        table.decimal("delivery_base", 14, 6).nullable();
        table.decimal("delivery_liter", 14, 6).nullable();
        table.decimal("storage_base", 14, 6).nullable();
        table.decimal("storage_liter", 14, 6).nullable();

        table.jsonb("raw_payload").notNullable();
        table.timestamps(true, true);

        table.unique(["tariff_date", "tariff_key"], {
            indexName: "wb_box_tariffs_daily_unique_day_key",
        });
        table.index(["tariff_date", "coefficient"], "wb_box_tariffs_daily_date_coeff_idx");
    });
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    const hasTariffs = await knex.schema.hasTable("wb_box_tariffs_daily");
    if (hasTariffs) {
        await knex.schema.dropTable("wb_box_tariffs_daily");
    }

    const hasSpreadsheets = await knex.schema.hasTable("spreadsheets");
    if (hasSpreadsheets) {
        const hasEnabled = await knex.schema.hasColumn("spreadsheets", "enabled");
        if (hasEnabled) {
            await knex.schema.alterTable("spreadsheets", (table) => {
                table.dropColumn("enabled");
            });
        }
    }
}