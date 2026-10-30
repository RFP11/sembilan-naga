import { z } from "zod";
import { monster } from "./schemas";
import monstersJson from "./srd/monsters.json";

// Monster stat blocks live behind their own entry point ("@dnd/data/monsters") because they
// are ~1 MB: pages that don't show monsters (like the character builder) skip them.

export const monsters = z.array(monster).parse(monstersJson);
