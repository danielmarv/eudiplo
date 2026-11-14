/** `url` without the slashes it ends with, as the instance URL is kept and compared. */
export function withoutTrailingSlashes(url: string): string {
  let trimmed = url;
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  return trimmed;
}

/** The host of an instance URL, such as `eudiplo.example.com`, to name the instance briefly. */
export function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
