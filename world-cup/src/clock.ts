// Render a live match clock for the score cards. `minute` is the raw clock token
// ingest stores on a live match: a minute count ("23"), an injury-time count
// ("45+2"), or a status label ("HT"). Numeric tokens get the trailing apostrophe
// ("45+2'"); a label like "HT" renders as-is. Empty/null collapses to "".
export function liveClock(minute: string | number | null | undefined): string {
  if (minute == null || minute === "") return "";
  const token = String(minute);
  return /\d/.test(token) ? `${token}'` : token;
}
