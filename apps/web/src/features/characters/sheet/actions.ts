import type {
  AddItemRequest,
  HpChangeRequest,
  ShortRestRequest,
  StatePatchRequest,
  UpdateItemRequest,
} from "@dnd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type { CharacterWithIssues } from "../api";

type Sheet = CharacterWithIssues;

/**
 * One sheet action. It returns the updated character, which replaces the cached one; an
 * error (e.g. 409: someone else edited the sheet) refetches it instead.
 */
function useSheetMutation<V, R extends Sheet>(id: string, request: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  const key = ["character", id];
  return useMutation({
    mutationFn: request,
    onSuccess: (c) => qc.setQueryData(key, { ...c, issues: [] }),
    onError: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useSheetActions(id: string) {
  return {
    hp: useSheetMutation(id, (body: HpChangeRequest) =>
      api<Sheet>(`/characters/${id}/hp`, { body }),
    ),
    deathSave: useSheetMutation(id, () =>
      api<Sheet & { roll: number }>(`/characters/${id}/death-save`, { method: "POST" }),
    ),
    patchState: useSheetMutation(id, (body: StatePatchRequest) =>
      api<Sheet>(`/characters/${id}/state`, { method: "PATCH", body }),
    ),
    shortRest: useSheetMutation(id, (body: ShortRestRequest) =>
      api<Sheet & { healed: number }>(`/characters/${id}/short-rest`, { body }),
    ),
    longRest: useSheetMutation(id, () =>
      api<Sheet>(`/characters/${id}/long-rest`, { method: "POST" }),
    ),
    addItem: useSheetMutation(id, (body: AddItemRequest) =>
      api<Sheet>(`/characters/${id}/items`, { body }),
    ),
    updateItem: useSheetMutation(
      id,
      ({ itemId, ...body }: UpdateItemRequest & { itemId: string }) =>
        api<Sheet>(`/characters/${id}/items/${itemId}`, { method: "PATCH", body }),
    ),
    removeItem: useSheetMutation(id, (itemId: string) =>
      api<Sheet>(`/characters/${id}/items/${itemId}`, { method: "DELETE" }),
    ),
  };
}

export type SheetActions = ReturnType<typeof useSheetActions>;
