import { Knex } from "knex";

export class SpreadsheetsRepository {
    private readonly knex: Knex;

    public constructor(knex: Knex) {
        this.knex = knex;
    }

    public async seedInitialIds(ids: string[]): Promise<void> {
        if (ids.length === 0) {
            return;
        }

        const rows = ids.map((spreadsheetId) => ({
            spreadsheet_id: spreadsheetId,
            enabled: true,
        }));

        await this.knex("spreadsheets")
            .insert(rows)
            .onConflict(["spreadsheet_id"])
            .merge({ enabled: true });
    }

    public async getEnabledIds(): Promise<string[]> {
        const rows = await this.knex("spreadsheets").select("spreadsheet_id").where({ enabled: true });
        return rows.map((row) => row.spreadsheet_id as string);
    }
}