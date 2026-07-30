import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSignup } from '@/features/auth/use-auth-mutations';
import { applyServerErrors } from '@/lib/use-server-errors';

import { AuthLayout } from './auth-layout';

const schema = z.object({
  businessName: z.string().min(2, 'Enter your business name'),
  fullName: z.string().min(2, 'Enter your full name'),
  email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(10, 'Use at least 10 characters'),
});

type FormValues = z.infer<typeof schema>;

const FIELDS = ['businessName', 'fullName', 'email', 'password'] as const;

export function SignupPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    try {
      await signup.mutateAsync({ ...values, country: 'IN', currency: 'INR' });
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  });

  return (
    <AuthLayout title="Create your account" subtitle="Start managing payments in a couple of minutes">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="businessName">Business name</Label>
              <Input id="businessName" placeholder="Acme Coffee Co" {...register('businessName')} />
              {errors.businessName && <p className="text-sm text-destructive">{errors.businessName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Your name</Label>
              <Input id="fullName" autoComplete="name" placeholder="Asha Raghavan" {...register('fullName')} />
              {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
            <Button type="submit" className="w-full" disabled={signup.isPending}>
              {signup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
