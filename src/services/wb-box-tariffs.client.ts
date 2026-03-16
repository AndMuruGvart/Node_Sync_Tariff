import crypto from "node:crypto";
import { NormalizedTariffRow } from "#services/types.js";

type WbBoxTariffsClientConfig = {
    apiUrl: string;
    apiToken?: string;
};

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string") {
        const normalized = value.replace(",", ".").trim();
        if (!normalized) {
            return null;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function pickNumber(entity: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const parsed = toNumber(entity[key]);
        if (parsed !== null) {
            return parsed;
        }
    }
    return null;
}

function pickString(entity: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = entity[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

function resolveCoefficient(entity: Record<string, unknown>): number | null {
    const direct = pickNumber(entity, [
        "coefficient",
        "deliveryCoef",
        "deliveryCoefficient",
        "boxDeliveryCoef",
        "tariffCoef",
    ]);

    if (direct !== null) {
        return direct;
    }

    const expression = pickString(entity, ["boxDeliveryAndStorageExpr", "deliveryAndStorageExpr", "expression"]);
    if (!expression) {
        return null;
    }

    const match = expression.match(/-?\d+(?:[.,]\d+)?/);
    if (!match) {
        return null;
    }

    return toNumber(match[0]);
}

function collectArrayCandidates(root: unknown): Record<string, unknown>[] {
    if (!root || typeof root !== "object") {
        return [];
    }

    const rootObject = root as Record<string, unknown>;

    const directCandidates = [
        rootObject,
        rootObject.response,
        (rootObject.response as Record<string, unknown> | undefined)?.data,
        rootObject.data,
    ];

    for (const candidate of directCandidates) {
        if (!candidate || typeof candidate !== "object") {
            continue;
        }

        const obj = candidate as Record<string, unknown>;
        const keysToTry = ["warehouseList", "tariffs", "items", "rows", "list", "data"];

        for (const key of keysToTry) {
            const value = obj[key];
            if (Array.isArray(value)) {
                return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
            }
        }

        if (Array.isArray(candidate)) {
            return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
        }
    }

    for (const value of Object.values(rootObject)) {
        if (Array.isArray(value)) {
            const rows = value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
            if (rows.length > 0) {
                return rows;
            }
        }
    }

    return [];
}

function buildTariffKey(row: Record<string, unknown>): string {
    const identity = [
        row.warehouseName,
        row.warehouseID,
        row.warehouseId,
        row.boxTypeName,
        row.boxTypeID,
        row.boxTypeId,
    ]
        .map((item) => (item === null || item === undefined ? "" : String(item)))
        .join("|");

    if (identity.replace(/\|/g, "").trim().length > 0) {
        return identity;
    }

    return crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

function normalizeRow(row: Record<string, unknown>): NormalizedTariffRow {
    return {
        tariffKey: buildTariffKey(row),
        warehouseName: pickString(row, ["warehouseName", "warehouse", "warehouse_name"]),
        warehouseId: pickNumber(row, ["warehouseID", "warehouseId"]),
        boxTypeName: pickString(row, ["boxTypeName", "boxType", "box_type_name"]),
        boxTypeId: pickNumber(row, ["boxTypeID", "boxTypeId"]),
        coefficient: resolveCoefficient(row),
        deliveryBase: pickNumber(row, ["deliveryBase", "deliveryBaseLiter", "baseDelivery"]),
        deliveryLiter: pickNumber(row, ["deliveryLiter", "deliveryAdditionalLiter", "additionalDelivery"]),
        storageBase: pickNumber(row, ["storageBase", "storageBaseLiter", "baseStorage"]),
        storageLiter: pickNumber(row, ["storageLiter", "storageAdditionalLiter", "additionalStorage"]),
        rawPayload: row,
    };
}

export class WbBoxTariffsClient {
    private readonly apiUrl: string;
    private readonly apiToken?: string;

    public constructor(config: WbBoxTariffsClientConfig) {
        this.apiUrl = config.apiUrl;
        this.apiToken = config.apiToken;
    }

    public async fetchByDate(date: string): Promise<NormalizedTariffRow[]> {
        if (!this.apiToken) {
            console.warn("[wb] WB_API_TOKEN is empty, skipping tariff collection");
            return [];
        }

        const url = new URL(this.apiUrl);
        url.searchParams.set("date", date);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: this.apiToken,
            },
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`[wb] request failed with status ${response.status}: ${body}`);
        }

        const payload = (await response.json()) as unknown;
        const rows = collectArrayCandidates(payload);
        return rows.map(normalizeRow);
    }
}