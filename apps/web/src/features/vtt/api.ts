import type {
  CreateTokenRequest,
  EncounterResponse,
  Scene,
  ScenesResponse,
  Token,
  TokenMove,
  UpdateSceneRequest,
  UpdateTokenRequest,
} from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, apiForm } from "../../lib/api";
import { socket } from "../../lib/socket";

export const sceneImageUrl = (campaignId: string, sceneId: string) =>
  `/api/campaigns/${campaignId}/scenes/${sceneId}/image`;

const key = (campaignId: string) => ["scenes", campaignId];

/** The campaign's maps, kept current when the DM changes what's on the table. */
export function useScenes(campaignId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const onChanged = (e: { campaignId: string }) => {
      if (e.campaignId === campaignId) void qc.invalidateQueries({ queryKey: key(campaignId) });
    };
    socket.on("scene:changed", onChanged);
    return () => {
      socket.off("scene:changed", onChanged);
    };
  }, [campaignId, qc]);
  return useQuery({
    queryKey: key(campaignId),
    queryFn: () => api<ScenesResponse>(`/campaigns/${campaignId}/scenes`),
  });
}

function useSceneMutation<T, R = unknown>(
  campaignId: string,
  mutationFn: (input: T) => Promise<R>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: key(campaignId) }),
  });
}

export function useUploadScene(campaignId: string) {
  return useSceneMutation(campaignId, (form: FormData) =>
    apiForm<Scene>(`/campaigns/${campaignId}/scenes`, form),
  );
}

export function useUpdateScene(campaignId: string) {
  return useSceneMutation(campaignId, ({ id, ...body }: { id: string } & UpdateSceneRequest) =>
    api<Scene>(`/campaigns/${campaignId}/scenes/${id}`, { method: "PATCH", body }),
  );
}

export function useSetActiveScene(campaignId: string) {
  return useSceneMutation(campaignId, (sceneId: string | null) =>
    api(`/campaigns/${campaignId}/active-scene`, { method: "PUT", body: { sceneId } }),
  );
}

export function useDeleteScene(campaignId: string) {
  return useSceneMutation(campaignId, (id: string) =>
    api(`/campaigns/${campaignId}/scenes/${id}`, { method: "DELETE" }),
  );
}

const tokensKey = (campaignId: string, sceneId: string | null) => [
  "tokens",
  campaignId,
  sceneId ?? "none",
];
const tokensUrl = (campaignId: string, sceneId: string) =>
  `/campaigns/${campaignId}/scenes/${sceneId}/tokens`;

const NO_TOKENS: Token[] = [];

/** The tokens on a map, kept current as anyone at the table changes them. */
export function useTokens(campaignId: string, sceneId: string | null) {
  const qc = useQueryClient();
  const key = tokensKey(campaignId, sceneId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api<Token[]>(tokensUrl(campaignId, sceneId!)),
    enabled: sceneId !== null,
  });

  useEffect(() => {
    const refetch = () => void qc.invalidateQueries({ queryKey: ["tokens", campaignId] });
    const onChanged = (e: { campaignId: string }) => {
      if (e.campaignId === campaignId) refetch();
    };
    const onMoved = (m: TokenMove) => {
      if (m.campaignId !== campaignId) return;
      qc.setQueryData<Token[]>(tokensKey(campaignId, sceneId), (all) =>
        all?.map((t) => (t.id === m.tokenId ? { ...t, x: m.x, y: m.y } : t)),
      );
    };
    socket.on("tokens:changed", onChanged);
    socket.on("token:moved", onMoved);
    // Moves made while disconnected were missed.
    socket.on("connect", refetch);
    return () => {
      socket.off("tokens:changed", onChanged);
      socket.off("token:moved", onMoved);
      socket.off("connect", refetch);
    };
  }, [campaignId, sceneId, qc]);

  const moveToken = (tokenId: string, x: number, y: number) => {
    qc.setQueryData<Token[]>(key, (all) =>
      all?.map((t) => (t.id === tokenId ? { ...t, x, y } : t)),
    );
    socket.emit("token:move", { campaignId, tokenId, x, y });
  };

  return { tokens: query.data ?? NO_TOKENS, moveToken };
}

function useTokenMutation<T>(
  campaignId: string,
  sceneId: string,
  mutationFn: (input: T) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: tokensKey(campaignId, sceneId) }),
  });
}

export function useAddTokens(campaignId: string, sceneId: string) {
  return useTokenMutation(campaignId, sceneId, (body: CreateTokenRequest) =>
    api<Token[]>(tokensUrl(campaignId, sceneId), { body }),
  );
}

/**
 * Applied on screen right away: buttons like HP -5 work from the shown value, so a second quick
 * click has to see the first one. Put back if the server refuses.
 */
export function useUpdateToken(campaignId: string, sceneId: string) {
  const qc = useQueryClient();
  const key = tokensKey(campaignId, sceneId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateTokenRequest) =>
      api<Token>(`${tokensUrl(campaignId, sceneId)}/${id}`, { method: "PATCH", body }),
    onMutate: async ({ id, ...changes }) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<Token[]>(key);
      qc.setQueryData<Token[]>(key, (all) =>
        all?.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...changes } as Token;
          // The server caps it at the maximum; show the same right away.
          if (next.hpCurrent !== null && next.hpMax !== null) {
            next.hpCurrent = Math.min(next.hpCurrent, next.hpMax);
          }
          return next;
        }),
      );
      return { before };
    },
    onError: (_err, _input, context) => {
      if (context?.before) qc.setQueryData(key, context.before);
    },
    onSettled: () => {
      // The last of several quick changes brings the final state back from the server.
      if (qc.isMutating() <= 1) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useDeleteToken(campaignId: string, sceneId: string) {
  return useTokenMutation(campaignId, sceneId, (id: string) =>
    api(`${tokensUrl(campaignId, sceneId)}/${id}`, { method: "DELETE" }),
  );
}

const encounterKey = (campaignId: string) => ["encounter", campaignId];
const encounterUrl = (campaignId: string) => `/campaigns/${campaignId}/encounter`;

/** The fight in progress, kept current as anyone at the table moves it on. */
export function useEncounter(campaignId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const onChanged = (e: { campaignId: string }) => {
      if (e.campaignId === campaignId) {
        void qc.invalidateQueries({ queryKey: encounterKey(campaignId) });
      }
    };
    // Names, HP and who's hidden come from the tokens; whether it shows depends on the map.
    const events = [
      "encounter:changed",
      "tokens:changed",
      "scene:changed",
      "character:updated",
    ] as const;
    for (const event of events) socket.on(event, onChanged);
    return () => {
      for (const event of events) socket.off(event, onChanged);
    };
  }, [campaignId, qc]);
  return useQuery({
    queryKey: encounterKey(campaignId),
    queryFn: () => api<EncounterResponse>(encounterUrl(campaignId)),
  });
}

function useEncounterMutation<T>(campaignId: string, mutationFn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    // Also after an error: a refused "next turn" means this screen was behind.
    onSettled: () => qc.invalidateQueries({ queryKey: encounterKey(campaignId) }),
  });
}

export function useStartEncounter(campaignId: string) {
  return useEncounterMutation(campaignId, (tokenIds: string[]) =>
    api(encounterUrl(campaignId), { body: { tokenIds } }),
  );
}

export function useNextTurn(campaignId: string) {
  return useEncounterMutation(campaignId, (currentId: string) =>
    api(`${encounterUrl(campaignId)}/next`, { body: { currentId } }),
  );
}

export function useEndEncounter(campaignId: string) {
  return useEncounterMutation(campaignId, () =>
    api(encounterUrl(campaignId), { method: "DELETE" }),
  );
}

export function useAddCombatants(campaignId: string) {
  return useEncounterMutation(campaignId, (tokenIds: string[]) =>
    api(`${encounterUrl(campaignId)}/combatants`, { body: { tokenIds } }),
  );
}

export function useSetInitiative(campaignId: string) {
  return useEncounterMutation(
    campaignId,
    ({ id, initiative }: { id: string; initiative: number }) =>
      api(`${encounterUrl(campaignId)}/combatants/${id}`, {
        method: "PATCH",
        body: { initiative },
      }),
  );
}

export function useRemoveCombatant(campaignId: string) {
  return useEncounterMutation(campaignId, (id: string) =>
    api(`${encounterUrl(campaignId)}/combatants/${id}`, { method: "DELETE" }),
  );
}
