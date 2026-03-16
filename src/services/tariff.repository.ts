import { Knex } from "knex";
import { NormalizedTariffRow, TariffSheetRow } from "#services/types.js";

type TariffDbRecord = {
    tariff_date: string;
    tariff_key: string;
    warehouse_name: string | null;
    warehouse_id: number | null;
    box_type_name: string | null;
    box_type_id: number | null;
    coefficient: number | null;
    delivery_base: number | null;
    delivery_liter: number | null;
    storage_base: number | null;
    storage_liter: number | null;
    raw_payload: Record<string, unknown>;
};

function toDbRecord(tariffDate: string, row: NormalizedTariffRow): TariffDbRecord {
    return {
        tariff_date: tariffDate,
        tariff_key: row.tariffKey,
        warehouse_name: row.warehouseName,
        warehouse_id: row.warehouseId,
        box_type_name: row.boxTypeName,
        box_type_id: row.boxTypeId,
        coefficient: row.coefficient,
        delivery_base: row.deliveryBase,
        delivery_liter: row.deliveryLiter,
        storage_base: row.storageBase,
        storage_liter: row.storageLiter,
        raw_payload: row.rawPayload,
    };
}

function fromDbRecord(row: {
    tariff_date: string;
    warehouse_name: string | null;
    warehouse_id: number | null;
    box_type_name: string | null;
    box_type_id: number | null;
    coefficient: number | string | null;
    delivery_base: number | string | null;
    delivery_liter: number | string | null;
    storage_base: number | string | null;
    storage_liter: number | string | null;
    updated_at: Date;
}): TariffSheetRow {
    const toNullableNumber = (value: number | string | null): number | null => {
        if (value === null) {
            return null;
        }
        return Number(value);
    };

    return {
        tariffDate: row.tariff_date,
        warehouseName: row.warehouse_name,
        warehouseId: row.warehouse_id,
        boxTypeName: row.box_type_name,
        boxTypeId: row.box_type_id,
        coefficient: toNullableNumber(row.coefficient),
        deliveryBase: toNullableNumber(row.delivery_base),
        deliveryLiter: toNullableNumber(row.delivery_liter),
        storageBase: toNullableNumber(row.storage_base),
        storageLiter: toNullableNumber(row.storage_liter),
        updatedAt: row.updated_at,
    };
}

export class TariffRepository {
    private readonly knex: Knex;

    public constructor(knex: Knex) {
        this.knex = knex;
    }

    public async upsertDailyTariffs(tariffDate: string, rows: NormalizedTariffRow[]): Promise<void> {
        if (rows.length === 0) {
            return;
        }

        const payload = rows.map((row) => toDbRecord(tariffDate, row));

        await this.knex("wb_box_tariffs_daily")
            .insert(payload)
            .onConflict(["tariff_date", "tariff_key"])
            .merge({
                warehouse_name: this.knex.ref("excluded.warehouse_name"),
                warehouse_id: this.knex.ref("excluded.warehouse_id"),
                box_type_name: this.knex.ref("excluded.box_type_name"),
                box_type_id: this.knex.ref("excluded.box_type_id"),
                coefficient: this.knex.ref("excluded.coefficient"),
                delivery_base: this.knex.ref("excluded.delivery_base"),
                delivery_liter: this.knex.ref("excluded.delivery_liter"),
                storage_base: this.knex.ref("excluded.storage_base"),
                storage_liter: this.knex.ref("excluded.storage_liter"),
                raw_payload: this.knex.ref("excluded.raw_payload"),
                updated_at: this.knex.fn.now(),
            });
    }

    public async getTariffsSortedByCoefficient(tariffDate: string): Promise<TariffSheetRow[]> {
        const rows = await this.knex("wb_box_tariffs_daily")
            .select([
                "tariff_date",
                "warehouse_name",
                "warehouse_id",
                "box_type_name",
                "box_type_id",
                "coefficient",
                "delivery_base",
                "delivery_liter",
                "storage_base",
                "storage_liter",
                "updated_at",
            ])
            .where({ tariff_date: tariffDate })
            .orderByRaw("coefficient ASC NULLS LAST")
            .orderBy("warehouse_name", "asc");

        return rows.map(fromDbRecord);
    }
}