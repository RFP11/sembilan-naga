import { z } from "zod";

// Battle maps. A map is an image plus its grid: how many image pixels one grid square spans and
// where the first line falls. One square is what a Medium token occupies.

/** Upload limit; the server enforces it, the form checks it for a quick error. */
export const MAX_MAP_BYTES = 25 * 1024 * 1024;
/** Larger images don't fit in a GPU texture on many devices. */
export const MAX_MAP_SIDE = 8192;
export const MIN_GRID_PX = 8;

export const scene = z.object({
  id: z.uuid(),
  name: z.string(),
  widthPx: z.number(),
  heightPx: z.number(),
  gridPx: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  /** Off for maps that already have a grid drawn in. */
  gridVisible: z.boolean(),
  createdAt: z.string(),
});
export type Scene = z.infer<typeof scene>;

/** Players only get the active map; the DM's other maps stay hidden until they're shown. */
export const scenesResponse = z.object({
  activeSceneId: z.uuid().nullable(),
  scenes: z.array(scene),
});
export type ScenesResponse = z.infer<typeof scenesResponse>;

export const updateSceneRequest = z
  .object({
    name: z.string().trim().min(1).max(100),
    gridPx: z.number().min(MIN_GRID_PX).max(MAX_MAP_SIDE),
    offsetX: z.number().min(0),
    offsetY: z.number().min(0),
    gridVisible: z.boolean(),
  })
  .refine((s) => s.offsetX < s.gridPx && s.offsetY < s.gridPx);
export type UpdateSceneRequest = z.input<typeof updateSceneRequest>;

export const setActiveSceneRequest = z.object({ sceneId: z.uuid().nullable() });
export type SetActiveSceneRequest = z.infer<typeof setActiveSceneRequest>;

/** How many whole squares fit on the map; at least one, so a token always has a place. */
export function sceneGridSize(
  s: Pick<Scene, "widthPx" | "heightPx" | "gridPx" | "offsetX" | "offsetY">,
) {
  return {
    cols: Math.max(1, Math.floor((s.widthPx - s.offsetX) / s.gridPx)),
    rows: Math.max(1, Math.floor((s.heightPx - s.offsetY) / s.gridPx)),
  };
}
