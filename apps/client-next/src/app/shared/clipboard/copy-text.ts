import type { NotifyService } from '../../core/notify/notify.service';

/**
 * Copies `text` and says so, naming it by `what` ("Client secret"). A browser can refuse, for
 * example on a page not served over HTTPS; the notice then asks the user to copy it by hand.
 */
export async function copyText(notify: NotifyService, text: string, what: string): Promise<void> {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    notify.success(`${what} copied.`);
  } catch {
    notify.error(`Could not copy the ${what.toLowerCase()}. Select it and copy it by hand.`);
  }
}
