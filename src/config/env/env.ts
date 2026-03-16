import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
    POSTGRES_DB: z.string().default("postgres"),
    POSTGRES_USER: z.string().default("postgres"),
    POSTGRES_PASSWORD: z.string().default("postgres"),
    APP_PORT: z.coerce.number().int().positive().default(5000),
    WB_API_URL: z.string().url().default("https://common-api.wildberries.ru/api/v1/tariffs/box"),
    WB_API_TOKEN: z.string().optional(),
    WB_POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    GOOGLE_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
    GOOGLE_SHEET_NAME: z.string().min(1).default("stocks_coefs"),
    GOOGLE_SYNC_ENABLED: z
        .enum(["true", "false", "1", "0"])
        .optional()
        .default("true"),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().optional(),
    INITIAL_SPREADSHEET_IDS: z.string().optional(),
});

const parsedEnv = envSchema.parse(process.env);

const env = {
    ...parsedEnv,
    GOOGLE_SYNC_ENABLED: ["true", "1"].includes(parsedEnv.GOOGLE_SYNC_ENABLED),
    INITIAL_SPREADSHEET_IDS: parsedEnv.INITIAL_SPREADSHEET_IDS
        ? parsedEnv.INITIAL_SPREADSHEET_IDS.split(",")
              .map((item) => item.trim())
              .filter(Boolean)
        : [],
};

export default env;
