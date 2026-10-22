import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authCopy, classifyAuthError, emailIssue, nameIssue, passwordIssue } from '../lib/authFlow.ts';

test('sign-in with no account offers a one-tap create path', () => {
  const failure = classifyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 });
  assert.equal(failure?.kind, 'no-account');
  assert.equal(authCopy.noAccount, 'No account with that email. Create one instead?');
});

test('anonymous sign-in turned off is not shown as a raw error', () => {
  const failure = classifyAuthError({
    code: 'anonymous_provider_disabled',
    message: 'Anonymous sign-ins are disabled',
  });
  assert.equal(failure?.kind, 'anonymous-disabled');
});

test('confirmation and rate limits use plain language', () => {
  assert.equal(classifyAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' })?.kind, 'confirm-email');
  assert.equal(classifyAuthError({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded', status: 429 })?.kind, 'rate-limit');
  assert.equal(authCopy.confirmEmail, 'Check your email to confirm');
  assert.match(authCopy.rateLimit, /Wait a minute/);
});

test('email fields validate before a request is sent', () => {
  assert.equal(emailIssue(''), 'Add your email.');
  assert.equal(emailIssue('not-an-email'), authCopy.badEmail);
  assert.equal(emailIssue('ama@knust.edu.gh'), null);
  assert.equal(passwordIssue('short'), authCopy.weakPassword);
  assert.equal(passwordIssue('longenough'), null);
  assert.equal(nameIssue('  '), authCopy.name);
  assert.equal(nameIssue('Ama'), null);
});

test('an existing email and a password that needs confirmation stay distinct', () => {
  assert.equal(classifyAuthError({ code: 'user_already_exists', message: 'User already registered' })?.kind, 'email-taken');
  assert.equal(
    classifyAuthError({ message: 'Password should be set after the email is verified' })?.kind,
    'confirm-email',
  );
  assert.equal(classifyAuthError({ code: 'manual_linking_disabled', message: 'Manual linking is disabled' })?.kind, 'manual-linking');
});
