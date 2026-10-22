import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Wordmark } from '@/components/Logo';
import { AppText, Button, Field, Notice, Screen } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { useToast } from '@/context/Toast';
import { supabase } from '@/lib/supabase';
import { type as typeScale } from '@/lib/theme';

export default function LoginScreen() {
  const params = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { colors } = useTheme();
  const toast = useToast();

  function done() {
    if (typeof params.next === 'string' && params.next.startsWith('/')) router.replace(params.next as '/');
    else router.back();
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      toast.show('Sign-in didn’t work. Check the email and password.', 'bad');
    } else done();
  }

  async function signUp() {
    setBusy(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() || undefined } },
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      toast.show('The account could not be created.', 'bad');
      return;
    }
    if (data.session) done();
    else setMessage('Check your email to confirm the account, then sign in.');
  }

  async function magic() {
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: Linking.createURL('/') },
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      toast.show('The sign-in link could not be sent.', 'bad');
    } else setMessage('Check your email for a sign-in link.');
  }

  return (
    <Screen scroll>
      <Wordmark />
      <AppText size={typeScale.body} color={colors.muted}>
        You can browse and plan routes without an account. Reporting and adding points need a sign-in.
      </AppText>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      <Field label="Display name for a new account" value={displayName} onChangeText={setDisplayName} />
      <Button label={busy ? 'Working…' : 'Sign in'} onPress={signIn} disabled={busy || !email || !password} />
      <Button label="Create account" variant="secondary" onPress={signUp} disabled={busy || !email || password.length < 6} />
      <Button label="Email me a magic link" variant="secondary" onPress={magic} disabled={busy || !email} />
      <Notice>
        Local demo account from the seed: demo@tekpath.app / TekpathDemo2026. That password is for the local stack only. On a hosted project, sign in with the password you chose when you created the user.
      </Notice>
      {message ? <Notice tone="good">{message}</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </Screen>
  );
}
