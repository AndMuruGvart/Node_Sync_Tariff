import http from "node:http";
import env from "#config/env/env.js";
import knex, { migrate } from "#postgres/knex.js";
import { GoogleSheetsSyncService } from "#services/google-sheets-sync.service.js";
import { SpreadsheetsRepository } from "#services/spreadsheets.repository.js";
import { TariffRepository } from "#services/tariff.repository.js";
import { WbBoxTariffsClient } from "#services/wb-box-tariffs.client.js";

function formatDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function scheduleTask(name: string, intervalMinutes: number, task: () => Promise<void>): NodeJS.Timeout {
    let inProgress = false;

    return setInterval(async () => {
        if (inProgress) {
            console.log(`[${name}] skipped: previous run is still in progress`);
            return;
        }

        inProgress = true;
        try {
            await task();
        } catch (error) {
            console.error(`[${name}] failed`, error);
        } finally {
            inProgress = false;
        }
    }, intervalMinutes * 60_000);
}

async function run() {
    await migrate.latest();

    const spreadsheetsRepo = new SpreadsheetsRepository(knex);
    const tariffsRepo = new TariffRepository(knex);
    const wbClient = new WbBoxTariffsClient({
        apiUrl: env.WB_API_URL,
        apiToken: env.WB_API_TOKEN,
    });
    const sheetsSyncService = new GoogleSheetsSyncService({
        enabled: env.GOOGLE_SYNC_ENABLED,
        sheetName: env.GOOGLE_SHEET_NAME,
        serviceAccountKeyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
        serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    });

    await spreadsheetsRepo.seedInitialIds(env.INITIAL_SPREADSHEET_IDS);

    const collectTariffs = async () => {
        const now = new Date();
        const date = formatDateOnly(now);
        const tariffs = await wbClient.fetchByDate(date);
        await tariffsRepo.upsertDailyTariffs(date, tariffs);
        console.log(`[wb] upserted ${tariffs.length} tariff rows for ${date}`);
    };

    const syncSheets = async () => {
        const ids = await spreadsheetsRepo.getEnabledIds();
        if (ids.length === 0) {
            console.log("[sheets] skipped: no spreadsheet ids in DB");
            return;
        }

        const date = formatDateOnly(new Date());
        const rows = await tariffsRepo.getTariffsSortedByCoefficient(date);
        await sheetsSyncService.syncMany(ids, rows, date);
        console.log(`[sheets] synced ${rows.length} rows to ${ids.length} spreadsheet(s)`);
    };

    try {
        await collectTariffs();
    } catch (error) {
        console.error("[wb] initial collection failed", error);
    }

    try {
        await syncSheets();
    } catch (error) {
        console.error("[sheets] initial sync failed", error);
    }

    const timers = [
        scheduleTask("wb-collect", env.WB_POLL_INTERVAL_MINUTES, collectTariffs),
        scheduleTask("google-sync", env.GOOGLE_SYNC_INTERVAL_MINUTES, syncSheets),
    ];

    const server = http.createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));
            return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Not Found" }));
    });

    server.listen(env.APP_PORT, () => {
        console.log(`Service started on port ${env.APP_PORT}`);
    });

    const shutdown = async (signal: string) => {
        console.log(`Received ${signal}. Shutting down...`);
        for (const timer of timers) {
            clearInterval(timer);
        }

        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });

        await knex.destroy();
        process.exit(0);
    };

    process.on("SIGINT", () => {
        void shutdown("SIGINT");
    });
    process.on("SIGTERM", () => {
        void shutdown("SIGTERM");
    });
}

run().catch(async (error) => {
    console.error("Application failed to start", error);
    await knex.destroy();
    process.exit(1);
});
