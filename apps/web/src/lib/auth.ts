import type { AuthProvidersResponse, MeResponse, UpdatePreferencesRequest } from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { socket } from "./socket";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<MeResponse>("/auth/me") });
}

export function useProviders() {
  return useQuery({
    queryKey: ["auth-providers"],
    queryFn: () => api<AuthProvidersResponse>("/auth/providers"),
  });
}

export function useDevLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api("/auth/dev-login", { body: { userId } }),
    onSuccess: () => qc.resetQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      socket.disconnect();
      qc.resetQueries();
    },
  });
}

/** Personal settings others see too, like the colour of your dice. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: UpdatePreferencesRequest) =>
      api<MeResponse>("/auth/me", { method: "PATCH", body: change }),
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}
