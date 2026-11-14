import { Injectable } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';

/** A button in a notice, such as Retry. */
interface NoticeAction {
  label: string;
  onClick: () => void;
}

export interface NoticeOptions {
  /** Milliseconds the notice stays; `Infinity` keeps it until it is closed. */
  duration?: number;
  action?: NoticeAction;
  /** A second line, for detail that does not fit the message. */
  description?: string;
}

/** An open notice. */
export interface Notice {
  dismiss(): void;
}

/**
 * How long an error notice stays: 5 s, longer for a message that carries the backend's
 * reason (about 80 ms per character). A message too long to read in 15 s stays until it
 * is closed.
 */
function errorNoticeDuration(message: string): number {
  const readingTime = message.length * 80;
  return readingTime > 15_000 ? Infinity : Math.max(5_000, readingTime);
}

/**
 * Notices at the edge of the screen, shown by the `<hlm-toaster>` in the app root. Every
 * notice has a close button, and screen readers announce it.
 */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  success(message: string, options: NoticeOptions = {}): Notice {
    return this.open(toast.success, message, { duration: 3_000, ...options });
  }

  info(message: string, options: NoticeOptions = {}): Notice {
    return this.open(toast.info, message, { duration: 5_000, ...options });
  }

  warning(message: string, options: NoticeOptions = {}): Notice {
    return this.open(toast.warning, message, { duration: 10_000, ...options });
  }

  /** A failed action, shown long enough to read the message. */
  error(message: string, options: NoticeOptions = {}): Notice {
    return this.open(toast.error, message, { duration: errorNoticeDuration(message), ...options });
  }

  private open(
    show: typeof toast.success,
    message: string,
    { duration, action, description }: NoticeOptions
  ): Notice {
    const id = show(message, {
      duration,
      description,
      action: action && { label: action.label, onClick: () => action.onClick() },
    });
    return { dismiss: () => toast.dismiss(id) };
  }
}
