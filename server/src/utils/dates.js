// Calendar days in India Standard Time (UTC+05:30, no daylight saving). The portal's reports group by Indian day,
// whatever time zone the server itself runs in (Render uses UTC).
const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

export const istDay = (date) => IST_DAY.format(date);

/** The last `count` Indian calendar days ending today (oldest first), plus the instant the first of them starts. */
export function lastIstDays(count, now = Date.now()) {
  const keys = Array.from({ length: count }, (_, i) => istDay(new Date(now - (count - 1 - i) * 24 * 3600 * 1000)));
  return { keys, start: new Date(`${keys[0]}T00:00:00+05:30`) };
}
