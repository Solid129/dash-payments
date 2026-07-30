import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAcceptInvite } from '@/features/auth/use-auth-mutations';
import { applyServerErrors } from '@/lib/use-server-errors';

import { AuthLayout } from './auth-layout';

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  password: z.string().min(10, 'Use at least 10 characters'),
});

type FormValues = z.infer<typeof schema>;

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const acceptInvite = useAcceptInvite();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    if (!token) {
      setFormError('This invitation link is missing its token.');
      return;
    }
    try {
      await acceptInvite.mutateAsync({ ...values, token });
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['fullName', 'password']));
    }
  });

  return (
    <AuthLayout title="Join your team" subtitle="Set a password to finish joining">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Your name</Label>
              <Input id="fullName" autoComplete="name" placeholder="Priya Nair" {...register('fullName')} />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">At least 10 characters — a passphrase works well.</p>
              )}
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button type="submit" className="w-full" disabled={acceptInvite.isPending}>
              {acceptInvite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Join team
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
