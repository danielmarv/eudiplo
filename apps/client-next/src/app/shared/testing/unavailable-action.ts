import { expect } from 'vitest';

/** Test helpers for an action that stays focusable while it cannot be used. */

/** What `element` says about itself beyond its name: the text of the elements its `aria-describedby` names. */
function descriptionOf(element: Element): string {
  const ids = element.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
  return ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim();
}

/**
 * `button` looks unavailable but keeps the focus and can be reached with Tab (`aria-disabled`
 * instead of `disabled`), and says why: in its description, or in its own label, as a button
 * that reads "Signing in…" while it signs in.
 */
export function expectUnavailable(button: HTMLButtonElement, reason: string): void {
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  const said = descriptionOf(button) || button.textContent?.trim();
  expect(said).toBe(reason);
}

/** `button` can be used and has no reason to give. */
export function expectAvailable(button: HTMLButtonElement): void {
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBeNull();
  expect(descriptionOf(button)).toBe('');
}
