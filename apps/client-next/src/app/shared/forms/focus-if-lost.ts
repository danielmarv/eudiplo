/**
 * Whether focus has fallen back to `<body>`, for example because the focused
 * control was removed with the content it belonged to, or is still on `from`,
 * a control that can no longer be used. False when the user has moved it
 * elsewhere in the meantime.
 */
export function focusWasLost(from?: Element | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || (!!from && active === from);
}
