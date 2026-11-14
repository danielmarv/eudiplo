import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Light or dark mode: the system's setting, until the user picks one, which is kept in this
 * browser. Dark mode is the `dark` class on `<html>`, which the Tailwind `dark:` variant reads.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'eudiplo-theme';
  readonly themeChanges = new Subject<boolean>();
  private readonly dark = signal(false);
  /** Whether dark mode is on, for templates. */
  readonly darkMode = this.dark.asReadonly();
  private readonly systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private hasUserPreference = false;

  constructor() {
    const storedTheme = this.readStoredTheme();
    this.hasUserPreference = storedTheme === 'dark' || storedTheme === 'light';
    this.dark.set(this.hasUserPreference ? storedTheme === 'dark' : this.systemThemeQuery.matches);
    this.systemThemeQuery.addEventListener('change', this.handleSystemThemeChange);
    this.applyTheme();
  }

  get isDarkMode(): boolean {
    return this.dark();
  }

  toggle(): void {
    this.dark.update((dark) => !dark);
    this.hasUserPreference = true;
    try {
      localStorage.setItem(this.storageKey, this.isDarkMode ? 'dark' : 'light');
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
    this.themeChanges.next(this.isDarkMode);
    this.applyTheme();
  }

  destroy(): void {
    this.systemThemeQuery.removeEventListener('change', this.handleSystemThemeChange);
    this.themeChanges.complete();
  }

  private readStoredTheme(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private readonly handleSystemThemeChange = (event: MediaQueryListEvent): void => {
    if (this.hasUserPreference) {
      return;
    }

    this.dark.set(event.matches);
    this.themeChanges.next(this.isDarkMode);
    this.applyTheme();
  };

  private applyTheme(): void {
    document.documentElement.classList.toggle('dark', this.isDarkMode);
  }
}
