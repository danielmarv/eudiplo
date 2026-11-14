import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'eudiplo.nav.collapsed.v2';

/**
 * Which navigation groups the user closed. Like the theme, this is a layout choice of the
 * browser, not of the signed-in client, so it is kept in local storage. Opening a page opens
 * its group again (see the shell).
 */
@Injectable({ providedIn: 'root' })
export class NavGroups {
  private readonly closed = signal<ReadonlySet<string>>(this.read());

  isClosed(label: string): boolean {
    return this.closed().has(label);
  }

  toggle(label: string): void {
    this.update((closed) => (closed.has(label) ? closed.delete(label) : closed.add(label)));
  }

  open(label: string): void {
    if (this.isClosed(label)) this.update((closed) => closed.delete(label));
  }

  private update(change: (closed: Set<string>) => void): void {
    const next = new Set(this.closed());
    change(next);
    this.closed.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  }

  private read(): ReadonlySet<string> {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return new Set(Array.isArray(stored) ? stored.filter((x) => typeof x === 'string') : []);
    } catch {
      return new Set();
    }
  }
}
