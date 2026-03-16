import fs from "node:fs/promises";
import { google } from "googleapis";
import { TariffSheetRow } from "#services/types.js";

const GOOGLE_SHEETS_SCOPE = ["https://www.googleapis.com/auth/spreadsheets"];

type GoogleSheetsSyncConfig = {
    enabled: boolean;
    sheetName: string;
    serviceAccountJson?: string;
    serviceAccountKeyFile?: string;
};

type GoogleServiceAccount = {
    client_email: string;
    private_key: string;
};

const DEFAULT_SERVICE_ACCOUNT_DIR = "./src/key";

function looksLikeJsonObject(value: string): boolean {
    const normalized = value.trim();
    return normalized.startsWith("{") && normalized.endsWith("}");
}

async function tryReadServiceAccountFile(filePath: string): Promise<GoogleServiceAccount | null> {
    try {
        const fileContent = await fs.readFile(filePath, "utf8");
        return parseServiceAccount(fileContent);
    } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode === "ENOENT") {
            return null;
        }
        throw error;
    }
}

async function findSingleServiceAccountFile(): Promise<string | null> {
    try {
        const entries = await fs.readdir(DEFAULT_SERVICE_ACCOUNT_DIR, { withFileTypes: true });
        const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

        if (jsonFiles.length !== 1) {
            return null;
        }

        return `${DEFAULT_SERVICE_ACCOUNT_DIR}/${jsonFiles[0].name}`;
    } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        if (errorCode === "ENOENT") {
            return null;
        }
        throw error;
    }
}

function parseServiceAccount(payload: string): GoogleServiceAccount {
    const raw = JSON.parse(payload) as Partial<GoogleServiceAccount>;

    if (!raw.client_email || !raw.private_key) {
        throw new Error("Google service account JSON must contain client_email and private_key");
    }

    return {
        client_email: raw.client_email,
        private_key: raw.private_key,
    };
}

function isLikelySpreadsheetId(spreadsheetId: string): boolean {
    const normalized = spreadsheetId.trim();
    if (normalized.length < 20) {
        return false;
    }

    return /^[a-zA-Z0-9_-]+$/.test(normalized);
}

function toSheetValues(date: string, rows: TariffSheetRow[]): (string | number)[][] {
    return [
        [
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
        ],
        ...rows.map((row) => [
            date,
            row.warehouseName ?? "",
            row.warehouseId ?? "",
            row.boxTypeName ?? "",
            row.boxTypeId ?? "",
            row.coefficient ?? "",
            row.deliveryBase ?? "",
            row.deliveryLiter ?? "",
            row.storageBase ?? "",
            row.storageLiter ?? "",
            row.updatedAt.toISOString(),
        ]),
    ];
}

export class GoogleSheetsSyncService {
    private readonly enabled: boolean;
    private readonly sheetName: string;
    private readonly serviceAccountJson?: string;
    private readonly serviceAccountKeyFile?: string;

    public constructor(config: GoogleSheetsSyncConfig) {
        this.enabled = config.enabled;
        this.sheetName = config.sheetName;
        this.serviceAccountJson = config.serviceAccountJson;
        this.serviceAccountKeyFile = config.serviceAccountKeyFile;
    }

    private async buildSheetsClient() {
        if (!this.enabled) {
            return null;
        }

        let credentials: GoogleServiceAccount | null = null;
        const fallbackFilePath = await findSingleServiceAccountFile();

        if (this.serviceAccountJson) {
            if (looksLikeJsonObject(this.serviceAccountJson)) {
                credentials = parseServiceAccount(this.serviceAccountJson);
            } else {
                credentials = await tryReadServiceAccountFile(this.serviceAccountJson);
                if (!credentials && fallbackFilePath) {
                    console.warn(
                        `[sheets] configured path was not found, using discovered service account file: ${fallbackFilePath}`,
                    );
                    credentials = await tryReadServiceAccountFile(fallbackFilePath);
                }
                if (!credentials) {
                    throw new Error(
                        `[sheets] GOOGLE_SERVICE_ACCOUNT_JSON looks like a file path, but file was not found: ${this.serviceAccountJson}`,
                    );
                }
            }
        } else if (this.serviceAccountKeyFile) {
            credentials = await tryReadServiceAccountFile(this.serviceAccountKeyFile);
            if (!credentials && fallbackFilePath) {
                console.warn(
                    `[sheets] configured key file was not found, using discovered service account file: ${fallbackFilePath}`,
                );
                credentials = await tryReadServiceAccountFile(fallbackFilePath);
            }
            if (!credentials) {
                throw new Error(`[sheets] service account key file was not found: ${this.serviceAccountKeyFile}`);
            }
        } else if (fallbackFilePath) {
            console.warn(`[sheets] using discovered service account file: ${fallbackFilePath}`);
            credentials = await tryReadServiceAccountFile(fallbackFilePath);
        }

        if (!credentials) {
            console.warn("[sheets] Google sync enabled, but service account credentials are not provided");
            return null;
        }

        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: GOOGLE_SHEETS_SCOPE,
        });

        return google.sheets({ version: "v4", auth });
    }

    private async ensureSheetExists(spreadsheetId: string, sheetsClient: ReturnType<typeof google.sheets>) {
        const sheetList = await sheetsClient.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });

        const alreadyExists = sheetList.data.sheets?.some((item) => item.properties?.title === this.sheetName);
        if (alreadyExists) {
            return;
        }

        await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{ addSheet: { properties: { title: this.sheetName } } }],
            },
        });
    }

    public async syncMany(spreadsheetIds: string[], rows: TariffSheetRow[], date: string): Promise<void> {
        const sheetsClient = await this.buildSheetsClient();
        if (!sheetsClient) {
            return;
        }

        const validSpreadsheetIds = spreadsheetIds.filter(isLikelySpreadsheetId);
        const skippedSpreadsheetIds = spreadsheetIds.filter((id) => !isLikelySpreadsheetId(id));

        if (skippedSpreadsheetIds.length > 0) {
            console.warn(
                `[sheets] skipped ${skippedSpreadsheetIds.length} invalid spreadsheet id(s): ${skippedSpreadsheetIds.join(", ")}`,
            );
        }

        if (validSpreadsheetIds.length === 0) {
            console.warn("[sheets] skipped: no valid spreadsheet ids after validation");
            return;
        }

        const values = toSheetValues(date, rows);

        for (const spreadsheetId of validSpreadsheetIds) {
            await this.ensureSheetExists(spreadsheetId, sheetsClient);
            await sheetsClient.spreadsheets.values.update({
                spreadsheetId,
                range: `${this.sheetName}!A1`,
                valueInputOption: "RAW",
                requestBody: {
                    values,
                },
            });
        }
    }
}