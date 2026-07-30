import { zodResolver } from '@hookform/resolvers/zod';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Mail, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { z } from 'zod';

import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { useAuth } from '@/features/auth/auth-context';
import {
  useInviteTeammate,
  usePendingInvitations,
  useRemoveMember,
  useRevokeInvitation,
  useTeamMembers,
  useUpdateMemberRole,
} from '@/features/team/use-team';
import { applyServerErrors } from '@/lib/use-server-errors';
import { canManageTeam } from '@/lib/permissions';
import type { UserRole } from '@/types/api';

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  ACCOUNTANT: 'Accountant',
  SUPPORT: 'Support',
};

const inviteSchema = z.object({
  email: z.string().min(1, 'Enter an email address').email('Enter a valid email address'),
  fullName: z.string().min(2, 'Enter a name'),
  role: z.enum(['OWNER', 'ACCOUNTANT', 'SUPPORT']),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

function InviteTeammateDialog() {
  const [open, setOpen] = useState(false);
  const invite = useInviteTeammate();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    control,
    setError,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'SUPPORT' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await invite.mutateAsync(values);
      toast({
        title: 'Invitation sent',
        description: `${values.email} can join once they accept the emailed invite.`,
        variant: 'success',
      });
      reset();
      setOpen(false);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'fullName', 'role']));
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email with a link to set a password and join your team. No real email is sent in
            this demo — the link is logged to the API console instead.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="invite-fullName">Name</Label>
            <Input id="invite-fullName" placeholder="Priya Nair" {...register('fullName')} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" placeholder="priya@business.com" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner — full access</SelectItem>
                    <SelectItem value="ACCOUNTANT">Accountant — view, export, and pay out</SelectItem>
                    <SelectItem value="SUPPORT">Support — view only</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamPage() {
  const { profile } = useAuth();
  const members = useTeamMembers();
  const invitations = usePendingInvitations();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const revokeInvitation = useRevokeInvitation();
  const { toast } = useToast();

  async function handleRoleChange(userId: string, role: UserRole) {
    try {
      await updateRole.mutateAsync({ userId, role });
    } catch (error) {
      const body = (error as { response?: { data?: { message?: string } } })?.response?.data;
      toast({ title: 'Could not change role', description: body?.message, variant: 'destructive' });
    }
  }

  async function handleRemove(userId: string) {
    try {
      await removeMember.mutateAsync(userId);
      toast({ title: 'Teammate removed', variant: 'success' });
    } catch (error) {
      const body = (error as { response?: { data?: { message?: string } } })?.response?.data;
      toast({ title: 'Could not remove teammate', description: body?.message, variant: 'destructive' });
    }
  }

  async function handleRevoke(invitationId: string) {
    await revokeInvitation.mutateAsync(invitationId);
    toast({ title: 'Invitation revoked' });
  }

  // Checked after every hook above has run, so hook order stays identical
  // regardless of role — see the same pattern in NewPayoutPage.
  if (profile && !canManageTeam(profile.user.role)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage who has access to your payments dashboard.</p>
        </div>
        <InviteTeammateDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !members.data?.length ? (
            <EmptyState icon={Users} title="No teammates yet" />
          ) : (
            <ul className="divide-y">
              {members.data.map((member) => {
                const isSelf = member.id === profile?.user.id;
                return (
                  <li key={member.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.fullName} {isSelf && <span className="text-muted-foreground">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isSelf ? (
                        <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                      ) : (
                        <>
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.id, value as UserRole)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OWNER">Owner</SelectItem>
                              <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
                              <SelectItem value="SUPPORT">Support</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(member.id)}
                            aria-label={`Remove ${member.fullName}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.isLoading ? (
            <Skeleton className="h-14 w-full" />
          ) : !invitations.data?.length ? (
            <EmptyState icon={Mail} title="No pending invitations" />
          ) : (
            <ul className="divide-y">
              {invitations.data.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {ROLE_LABELS[invitation.role]} ·{' '}
                      {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(invitation.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
