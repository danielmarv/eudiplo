import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { signInAs, takeSignInAs } from './sign-in-as';

@Component({ template: '' })
class Blank {}

describe('sign in as a client', () => {
  const client = { clientId: 'acme-admin', clientSecret: 'example-secret', apiUrl: 'https://api.test' };

  afterEach(() => history.replaceState(null, ''));

  it('opens the login page with the client in the navigation state, not in the address', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'login', component: Blank }])],
    });
    const router = TestBed.inject(Router);

    await signInAs(router, client);

    expect(router.url).toBe('/login');
    expect(TestBed.inject(Location).path()).not.toContain('example-secret');
    expect((TestBed.inject(Location).getState() as { signInAs?: unknown }).signInAs).toEqual(
      client
    );
  });

  it('hands the client over once and removes it from the history entry', () => {
    history.replaceState({ navigationId: 3, signInAs: client }, '');

    expect(takeSignInAs()).toEqual(client);
    expect(history.state).toEqual({ navigationId: 3 });
    expect(takeSignInAs()).toBeUndefined();
  });

  it('ignores an incomplete hand-over, and still removes it', () => {
    history.replaceState({ signInAs: { clientId: 'acme-admin', apiUrl: 'https://api.test' } }, '');

    expect(takeSignInAs()).toBeUndefined();
    expect(history.state).toEqual({});
  });
});
