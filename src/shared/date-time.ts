const KOREA_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const OFFSETLESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(\.\d{1,3})?)?$/;

export function formatKoreaDateTime(value: string | null): string | null {
  if (!value) return null;

  const offsetless = OFFSETLESS_DATE_TIME.exec(value);
  const utcValue = offsetless
    ? `${offsetless[1]}T${offsetless[2]}:${offsetless[3] ?? '00'}${offsetless[4] ?? ''}Z`
    : value;
  const date = new Date(utcValue);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    KOREA_DATE_TIME.formatToParts(date).map(part => [part.type, part.value]),
  );
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
