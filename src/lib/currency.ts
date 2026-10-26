/**
 * Currency (Oct 25): a cost can be priced in another currency (Wix in USD, a trip in AUD).
 * The CAD amount is what counts in every total; the original price is kept beside it.
 * Rates come from Frankfurter (European Central Bank, free, no key), with open.er-api.com as a
 * backup, and are kept for the day on this device.
 */
export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'MXN', 'JPY'];
export const HOME = 'CAD';

const today = () => new Date().toISOString().slice(0, 10);
const cacheKey = (from: string) => `launchpage.rate.${from}.${HOME}`;

/** How many CAD one unit of `from` buys today. Throws when no rate can be reached. */
export async function rateToCad(from: string): Promise<number> {
  const code = from.toUpperCase();
  if (code === HOME) return 1;
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey(code)) ?? 'null') as { day: string; rate: number } | null;
    if (hit && hit.day === today() && hit.rate > 0) return hit.rate;
  } catch {
    /* no cache */
  }
  const sources: (() => Promise<number>)[] = [
    async () => {
      const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${code}&symbols=${HOME}`);
      const j = await r.json();
      return Number(j?.rates?.[HOME]);
    },
    async () => {
      const r = await fetch(`https://open.er-api.com/v6/latest/${code}`);
      const j = await r.json();
      return Number(j?.rates?.[HOME]);
    }
  ];
  for (const src of sources) {
    try {
      const rate = await src();
      if (rate > 0 && Number.isFinite(rate)) {
        try {
          localStorage.setItem(cacheKey(code), JSON.stringify({ day: today(), rate }));
        } catch {
          /* ignore */
        }
        return rate;
      }
    } catch {
      /* try the next source */
    }
  }
  throw new Error(`Couldn't get today's ${code} → ${HOME} rate. Check the connection, or type the CAD amount.`);
}

export const toCad = (amount: number, rate: number) => Math.round(amount * rate * 100) / 100;

/** "15.69 USD" for a line or expense priced in another currency, else ''. */
export const originalLabel = (x: { foreign?: number | null; currency?: string }) =>
  x.currency && x.currency !== HOME && x.foreign != null ? `${x.foreign} ${x.currency}` : '';
