import type { BuildIssue, Character, CharacterBuild, CharacterSummary } from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type CharacterWithIssues = Character & { issues: BuildIssue[] };

export function useMyCharacters() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: () => api<CharacterSummary[]>("/characters"),
  });
}

export function useCharacter(id: string) {
  return useQuery({
    queryKey: ["character", id],
    queryFn: () => api<CharacterWithIssues>(`/characters/${id}`),
  });
}

export function useCreateCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string | null) =>
      api<Character>("/characters", { body: { campaignId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });
}

export function useSaveDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { build?: CharacterBuild; builderStep?: number }) =>
      api<CharacterWithIssues>(`/characters/${id}`, {
        method: "PATCH",
        // The server ignores `abilityRolls` here; only the roll endpoint sets it.
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });
}

export function useRollAbilities(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CharacterWithIssues>(`/characters/${id}/roll-abilities`, { method: "POST" }),
    onSuccess: (c) => qc.setQueryData(["character", id], c),
  });
}

export function useFinalize(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<Character>(`/characters/${id}/finalize`, { method: "POST" }),
    onSuccess: (c) => {
      qc.setQueryData(["character", id], { ...c, issues: [] });
      void qc.invalidateQueries({ queryKey: ["characters"] });
    },
  });
}

export function useDeleteCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/characters/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });
}
