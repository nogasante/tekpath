export type AuthMode = 'signin' | 'create';

export type AuthFailure =
  | { kind: 'anonymous-disabled' }
  | { kind: 'manual-linking' }
  | { kind: 'no-account' }
  | { kind: 'confirm-email' }
  | { kind: 'rate-limit' }
  | { kind: 'email-taken' }
  | { kind: 'weak-password' }
  | { kind: 'bad-email' }
  | { kind: 'message'; text: string };

const noAccount = 'No account with that email. Create one instead?';
const confirmEmail = 'Check your email to confirm';
const rateLimit = 'Too many attempts. Wait a minute and try again.';

export const authCopy = {
  noAccount,
  confirmEmail,
  rateLimit,
  emailTaken: 'That email already has an account. Sign in instead?',
  weakPassword: 'Use at least 6 characters.',
  badEmail: 'Enter an email address like name@university.edu.',
  name: 'Add the name you want on your reports.',
  manualLinking: 'Adding an email to a guest account is not switched on yet. You can keep reporting as a guest.',
  generic: 'That didn’t work. Try again in a moment.',
} as const;

let guestSignInHidden = false;

export function isGuestSignInHidden() {
  return guestSignInHidden;
}

export function rememberGuestSignInHidden() {
  guestSignInHidden = true;
}

export function emailIssue(email: string) {
  const value = email.trim();
  if (!value) return 'Add your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return authCopy.badEmail;
  return null;
}

export function passwordIssue(password: string) {
  if (!password) return 'Add a password.';
  if (password.length < 6) return authCopy.weakPassword;
  return null;
}

export function nameIssue(name: string) {
  if (!name.trim()) return authCopy.name;
  return null;
}

type AuthErrorLike = { message?: string; code?: string; status?: number };

export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthFailure | null {
  if (!error) return null;
  const code = (error.code ?? '').toLowerCase();
  const message = error.message ?? '';
  const lower = message.toLowerCase();

  if (code === 'anonymous_provider_disabled' || lower.includes('anonymous sign-ins are disabled')) {
    return { kind: 'anonymous-disabled' };
  }
  if (code === 'manual_linking_disabled' || lower.includes('manual linking')) {
    return { kind: 'manual-linking' };
  }
  if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) {
    return { kind: 'no-account' };
  }
  if (code === 'email_not_confirmed' || lower.includes('email not confirmed')) {
    return { kind: 'confirm-email' };
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    code === 'over_sms_send_rate_limit' ||
    error.status === 429 ||
    lower.includes('rate limit')
  ) {
    return { kind: 'rate-limit' };
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    lower.includes('already registered') ||
    lower.includes('already been registered')
  ) {
    return { kind: 'email-taken' };
  }
  if (code === 'weak_password' || lower.includes('at least 6')) {
    return { kind: 'weak-password' };
  }
  if (code === 'email_address_invalid' || (code === 'validation_failed' && lower.includes('email'))) {
    return { kind: 'bad-email' };
  }
  if (lower.includes('verified') && lower.includes('password')) {
    return { kind: 'confirm-email' };
  }
  if (message.length > 160 || /jwt|sql|stack|token|schema/i.test(message)) {
    return { kind: 'message', text: authCopy.generic };
  }
  return { kind: 'message', text: message || authCopy.generic };
}

export function authFailureText(failure: AuthFailure) {
  switch (failure.kind) {
    case 'anonymous-disabled':
      return '';
    case 'manual-linking':
      return authCopy.manualLinking;
    case 'no-account':
      return authCopy.noAccount;
    case 'confirm-email':
      return authCopy.confirmEmail;
    case 'rate-limit':
      return authCopy.rateLimit;
    case 'email-taken':
      return authCopy.emailTaken;
    case 'weak-password':
      return authCopy.weakPassword;
    case 'bad-email':
      return authCopy.badEmail;
    default:
      return failure.text;
  }
}
