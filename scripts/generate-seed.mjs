// CLI entrypoint for (re)generating InsureLead Intelligence's synthetic
// demo leads and their matching consent records. Run with:
//
//   npm run seed:demo
//
// The actual generator lives in src/lib/demo-seed-data.ts (a plain
// TypeScript module, no fs I/O) so this script and the in-app "Reset
// demo data" admin action (resetDemoData() in src/lib/demo-store.ts,
// used by /dashboard/demo-tools in demo mode only) can never drift apart
// by sharing one generator instead of each keeping its own copy. This
// file is run through `node --import tsx` (see the "seed:demo" script in
// package.json) specifically so it can import that TypeScript module
// directly, the same way scripts/verify-tenancy.ts and
// scripts/verify-campaigns.ts already do.
//
// No real personal or business information is used anywhere in this
// file or in src/lib/demo-seed-data.ts.
import { writeFileSync } from "fs";
import { generateSyntheticLeadSeed } from "../src/lib/demo-seed-data.ts";

const { leads, consents } = generateSyntheticLeadSeed();

writeFileSync(new URL("../data/leads.json", import.meta.url), JSON.stringify(leads, null, 2));
console.log(`Generated ${leads.length} synthetic demo leads -> data/leads.json`);

writeFileSync(new URL("../data/consents.json", import.meta.url), JSON.stringify(consents, null, 2));
console.log(`Generated ${consents.length} synthetic consent records -> data/consents.json`);
