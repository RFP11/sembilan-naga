import { z } from "zod";
import { startingEquipment as equipmentData } from "./equipment";
import * as s from "./schemas";
import { speciesBuilders as speciesData } from "./species";

export * from "./schemas";

/** Species grants and choices for the character builder. */
export const speciesBuilders = z.array(s.speciesBuilder).parse(speciesData);
/** Class and background starting equipment packages. */
export const startingEquipment = z.array(s.startingEquipment).parse(equipmentData);
