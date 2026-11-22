import { z } from "zod";

/** `config/vn-market.json`: where market-data reads Vietnamese stocks (assets with `display.chain: "hose"`). */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const vnMarketFileSchema = z.strictObject({
    $comment: z.string().optional(),
    version: z.literal(1),
    source: z.strictObject({
      provider: z.literal("vndirect-dchart"),
      baseUrl: z.string().url(),
      priceUnitVnd: z.number().positive(),
      pollSec: z.number().int().min(5),
      dailyRefreshSec: z.number().int().min(30),
      dailyLookbackDays: z.number().int().min(31),
      volumeSessions: z.number().int().min(1).max(60),
    }),
    fx: z.strictObject({
      provider: z.literal("vietcombank-xml"),
      url: z.string().url(),
      rate: z.enum(["Buy", "Transfer", "Sell"]),
      refreshSec: z.number().int().min(60),
    }),
    session: z.strictObject({
      timezoneOffsetMin: z.number().int(),
      days: z.array(z.number().int().min(0).max(6)).min(1),
      open: hhmm,
      close: hhmm,
      /** lunch break etc.: no trading, the last price stays valid */
      breaks: z.array(z.tuple([hhmm, hhmm])),
      staleInSessionSec: z.number().int().min(30),
    }),
  });
export type VnMarketFile = z.infer<typeof vnMarketFileSchema>;

