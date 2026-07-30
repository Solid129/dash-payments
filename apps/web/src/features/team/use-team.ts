import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import type { PendingInvitation, TeamMember, UserRole } from '@/types/api';

export function useTeamMembers() {
  return useQuery({
    queryKey: ['team', 'members'],
    queryFn: async () => {
      const { data } = await api.get<TeamMember[]>('/team/members');
      return data;
    },
  });
}

export function usePendingInvitations() {
  return useQuery({
    queryKey: ['team', 'invitations'],
    queryFn: async () => {
      const { data } = await api.get<PendingInvitation[]>('/team/invitations');
      return data;
    },
  });
}

export interface InviteTeammateInput {
  email: string;
  fullName: string;
  role: UserRole;
}

export function useInviteTeammate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteTeammateInput) => {
      const { data } = await api.post<{ id: string; email: string; role: UserRole; devInviteToken?: string }>(
        '/team/invitations',
        input,
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'invitations'] });
    },
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      await api.delete(`/team/invitations/${invitationId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'invitations'] });
    },
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      await api.patch(`/team/members/${userId}`, { role });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/team/members/${userId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });
}
