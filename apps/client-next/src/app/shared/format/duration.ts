const UNITS = [
  { seconds: 86_400, one: 'day', many: 'days' },
  { seconds: 3_600, one: 'hour', many: 'hours' },
  { seconds: 60, one: 'minute', many: 'minutes' },
] as const;

/**
 * A number of seconds in the largest unit that divides it: "1 day", "36 hours", "90 seconds".
 * Settings such as a time-to-live are usually set in round units, which this keeps exact.
 */
export function duration(seconds: number): string {
  const unit = UNITS.find(
    (candidate) => seconds >= candidate.seconds && seconds % candidate.seconds === 0
  );
  if (!unit) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const count = seconds / unit.seconds;
  return `${count} ${count === 1 ? unit.one : unit.many}`;
}

/** Time left, in words that cannot pass for a time of day: "23 h 05 min", "4 min 09 s", "9 s". */
export function timeLeft(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  if (hours) return `${hours} h ${pad(minutes)} min`;
  if (minutes) return `${minutes} min ${pad(seconds)} s`;
  return `${seconds} s`;
}
