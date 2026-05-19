import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js convention puts secrets in .env.local; dotenv v17 default only
// reads .env, so load .env.local explicitly for `pnpm db:push` etc.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
