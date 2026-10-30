// Rebuilds every src/srd/*.json from the extracted SRD text.
// Run: pnpm --filter @dnd/data srd:build   (after srd:extract)

import "./build-reference";
import "./build-equipment";
import "./build-spells";
import "./build-origins";
import "./build-classes";
import "./build-items";
