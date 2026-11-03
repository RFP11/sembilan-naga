import type {
  CreateNoteRequest,
  DmResponse,
  InviteCoDmResponse,
  MapEra,
  MyRegistrationResponse,
  NotesResponse,
  PromoResponse,
  Registration,
  ReviewRegistrationRequest,
  UpdateNoteRequest,
} from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiForm } from "../../lib/api";

export function usePromo() {
  return useQuery({ queryKey: ["promo"], queryFn: () => api<PromoResponse>("/promo") });
}

export function useMyRegistration(enabled: boolean) {
  return useQuery({
    queryKey: ["my-registration"],
    queryFn: () => api<MyRegistrationResponse>("/promo/registration"),
    enabled,
  });
}

export function useSubmitRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => apiForm<Registration>("/promo/registration", form),
    onSuccess: (registration) => {
      qc.setQueryData<MyRegistrationResponse>(["my-registration"], { registration });
    },
  });
}

export function useDm(enabled: boolean) {
  return useQuery({
    queryKey: ["promo-dm"],
    queryFn: () => api<DmResponse>("/promo/dm"),
    enabled,
    retry: false,
  });
}

export function useEraPreview(era: MapEra, enabled: boolean) {
  return useQuery({
    queryKey: ["promo-preview", era],
    queryFn: () => api<PromoResponse>(`/promo/dm/preview/${era}`),
    enabled,
  });
}

export function useSetEra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (era: MapEra) => api("/promo/dm/era", { method: "PUT", body: { era } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promo"] });
      void qc.invalidateQueries({ queryKey: ["promo-dm"] });
    },
  });
}

export function useSetRegistrationOpen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (open: boolean) => api("/promo/dm/registration", { method: "PUT", body: { open } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promo"] });
      void qc.invalidateQueries({ queryKey: ["promo-dm"] });
    },
  });
}

export function useInviteCoDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api<InviteCoDmResponse>("/promo/dm/co-dms/invites", { body: { email } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promo-dm"] }),
  });
}

export function useCancelCoDmInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/promo/dm/co-dms/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promo-dm"] }),
  });
}

export function useRemoveCoDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api(`/promo/dm/co-dms/${userId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promo-dm"] }),
  });
}

export function useAcceptCoDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api("/promo/co-dm/accept", { body: { token } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["promo"] });
      void qc.invalidateQueries({ queryKey: ["promo-dm"] });
    },
  });
}

export function useNotes(enabled: boolean) {
  return useQuery({
    queryKey: ["promo-notes"],
    queryFn: () => api<NotesResponse>("/promo/dm/notes"),
    enabled,
    retry: false,
    // Picks up what the other DMs write while this page stays open.
    refetchInterval: 30_000,
  });
}

function useNoteMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void qc.invalidateQueries({ queryKey: ["promo-notes"] }),
  });
}

export function useCreateNote() {
  return useNoteMutation((body: CreateNoteRequest) => api("/promo/dm/notes", { body }));
}

export function useUpdateNote() {
  return useNoteMutation(({ id, ...body }: { id: string } & UpdateNoteRequest) =>
    api(`/promo/dm/notes/${id}`, { method: "PATCH", body }),
  );
}

export function useDeleteNote() {
  return useNoteMutation((id: string) => api(`/promo/dm/notes/${id}`, { method: "DELETE" }));
}

export function useReviewRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string } & ReviewRegistrationRequest) =>
      api<Registration>(`/promo/dm/registrations/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promo-dm"] }),
  });
}
