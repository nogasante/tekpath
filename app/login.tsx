import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PasswordField } from '@/components/PasswordField';
import { Wordmark } from '@/components/Logo';
import { AppText, Button, Field, Notice } from '@/components/ui';
import { useToast } from '@/context/Toast';
import { haptic } from '@/lib/haptics';
import {
  authCopy,
  authFailureText,
  classifyAuthError,
  emailIssue,
  isGuestSignInHidden,
  nameIssue,
  passwordIssue,
  rememberGuestSignInHidden,
  type AuthMode,
} from '@/lib/authFlow';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/Theme';
import { radii, spacing, type as typeScale } from '@/lib/theme';

type Step = 'gate' | 'email' | 'inbox';

function intent(next: string | undefined) {
  if (next?.includes('feature') || next?.includes('guide')) {
    return {
      title: 'Send this report',
      body: 'A guest is enough, and the report goes through on this phone. The map, search, and routes never need an account.',
    };
  }
  if (next?.includes('add-point') || next?.includes('map-building') || next?.includes('walk')) {
    return {
      title: 'Save this to the map',
      body: 'A guest is enough. You can add an email later from Account. Looking around the campus stays open either way.',
    };
  }
  return {
    title: 'Continue',
    body: 'The map, search, routes, and indoor guidance work with no account. A guest or an email is only for reports and new points.',
  };
}

export default function LoginScreen() {
  const params = useLocalSearchParams<{ next?: string }>();
  const next = typeof params.next === 'string' ? params.next : undefined;
  const copy = intent(next);
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(isGuestSignInHidden() ? 'email' : 'gate');
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [offerCreate, setOfferCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const guestHidden = isGuestSignInHidden();

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function done(message: string) {
    toast.show(message);
    void haptic('success');
    close();
  }

  function showFailure(error: { message?: string; code?: string; status?: number }) {
    const failure = classifyAuthError(error);
    if (!failure || failure.kind === 'anonymous-disabled') {
      rememberGuestSignInHidden();
      setFormError(null);
      setStep('email');
      return;
    }
    if (failure.kind === 'confirm-email') {
      setFormError(null);
      setStep('inbox');
      return;
    }
    if (failure.kind === 'no-account') {
      setOfferCreate(true);
      setFormError(authCopy.noAccount);
      return;
    }
    if (failure.kind === 'email-taken') {
      setMode('signin');
      setOfferCreate(false);
      setFormError(authCopy.emailTaken);
      return;
    }
    if (failure.kind === 'weak-password') setPasswordError(authCopy.weakPassword);
    if (failure.kind === 'bad-email') setEmailError(authCopy.badEmail);
    setOfferCreate(false);
    setFormError(authFailureText(failure));
  }

  async function continueAsGuest() {
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.auth.signInAnonymously({
      options: { data: { display_name: 'Guest' } },
    });
    setBusy(false);
    if (error) {
      if (classifyAuthError(error)?.kind === 'anonymous-disabled') {
        rememberGuestSignInHidden();
        setStep('email');
        return;
      }
      showFailure(error);
      return;
    }
    done('Continuing as a guest.');
  }

  function validate() {
    const nextEmail = emailIssue(email);
    const nextPassword = passwordIssue(password);
    const nextName = mode === 'create' ? nameIssue(displayName) : null;
    setEmailError(nextEmail);
    setPasswordError(nextPassword);
    setNameError(nextName);
    return !nextEmail && !nextPassword && !nextName;
  }

  async function submitEmail() {
    setFormError(null);
    setOfferCreate(false);
    if (!validate()) return;
    setBusy(true);
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) showFailure(error);
      else done('Signed in.');
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setBusy(false);
    if (error) {
      showFailure(error);
      return;
    }
    if (data.session) done('Account created.');
    else setStep('inbox');
  }

  async function resend() {
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setBusy(false);
    if (error) showFailure(error);
    else toast.show('Confirmation email sent again.');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={close} style={{ flex: 1 }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            gap: spacing.md,
            maxHeight: '88%',
          }}>
          <View style={{ alignSelf: 'center', width: 48, height: 5, borderRadius: 3, backgroundColor: colors.line }} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <Wordmark />
            {step === 'gate' ? (
              <>
                <AppText accessibilityRole="header" size={typeScale.title} weight="700">
                  {copy.title}
                </AppText>
                <AppText color={colors.muted}>{copy.body}</AppText>
                <Button label={busy ? 'Continuing…' : 'Continue as guest'} icon="person" onPress={() => void continueAsGuest()} disabled={busy} />
                <Button label="Use email" variant="secondary" icon="mail" onPress={() => setStep('email')} disabled={busy} />
                <Button label="Not now" variant="ghost" onPress={close} />
              </>
            ) : null}
            {step === 'email' ? (
              <>
                <AppText accessibilityRole="header" size={typeScale.title} weight="700">
                  {mode === 'create' ? 'Create account' : 'Sign in'}
                </AppText>
                <AppText color={colors.muted}>
                  {guestHidden
                    ? 'Use an email to save reports under your name. The campus map stays open without one.'
                    : 'Same email screen for a new account or one you already have.'}
                </AppText>
                <View
                  accessibilityRole="tablist"
                  style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radii.md, padding: 4, gap: 4 }}>
                  {(
                    [
                      ['signin', 'Sign in'],
                      ['create', 'Create account'],
                    ] as const
                  ).map(([value, label]) => {
                    const active = mode === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setMode(value);
                          setFormError(null);
                          setOfferCreate(false);
                          setNameError(null);
                          void haptic('selection');
                        }}
                        style={{
                          flex: 1,
                          minHeight: 48,
                          borderRadius: radii.sm,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: active ? colors.primary : 'transparent',
                        }}>
                        <AppText weight="700" color={active ? colors.onPrimary : colors.ink}>
                          {label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {mode === 'create' ? (
                  <View style={{ gap: 6 }}>
                    <Field
                      label="Name"
                      value={displayName}
                      onChangeText={(value) => {
                        setDisplayName(value);
                        setNameError(null);
                      }}
                      autoComplete="name"
                      placeholder="Shown on your reports"
                    />
                    {nameError ? (
                      <AppText accessibilityRole="alert" size={typeScale.label} color={colors.danger}>
                        {nameError}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
                <View style={{ gap: 6 }}>
                  <Field
                    label="Email"
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      setEmailError(null);
                      setOfferCreate(false);
                    }}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="name@university.edu"
                  />
                  {emailError ? (
                    <AppText accessibilityRole="alert" size={typeScale.label} color={colors.danger}>
                      {emailError}
                    </AppText>
                  ) : null}
                </View>
                <PasswordField
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setPasswordError(null);
                  }}
                  error={passwordError}
                />
                {formError ? <Notice tone={offerCreate ? 'info' : 'bad'}>{formError}</Notice> : null}
                {offerCreate ? (
                  <AppText size={typeScale.label} color={colors.muted}>
                    If you already created an account, check the password and try again.
                  </AppText>
                ) : null}
                <Button
                  label={busy ? 'Working…' : mode === 'create' ? 'Create account' : 'Sign in'}
                  onPress={() => void submitEmail()}
                  disabled={busy}
                />
                {offerCreate ? (
                  <Button
                    label="Create one instead"
                    variant="secondary"
                    onPress={() => {
                      setMode('create');
                      setOfferCreate(false);
                      setFormError(null);
                    }}
                  />
                ) : null}
                <Button label={guestHidden ? 'Not now' : 'Back'} variant="ghost" onPress={() => (guestHidden ? close() : setStep('gate'))} />
              </>
            ) : null}
            {step === 'inbox' ? (
              <>
                <AppText accessibilityRole="header" size={typeScale.title} weight="700">
                  {authCopy.confirmEmail}
                </AppText>
                <AppText color={colors.muted}>
                  We sent a link to {email.trim() || 'your inbox'}. Open it to finish, then come back and sign in. The map is still here while you wait.
                </AppText>
                {formError ? <Notice tone="bad">{formError}</Notice> : null}
                <Button label={busy ? 'Sending…' : 'Resend email'} icon="mail" onPress={() => void resend()} disabled={busy || !email.trim()} />
                <Button
                  label="Back to sign in"
                  variant="secondary"
                  onPress={() => {
                    setMode('signin');
                    setStep('email');
                    setFormError(null);
                  }}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
