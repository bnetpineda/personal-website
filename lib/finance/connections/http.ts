import "server-only";
import { get } from "node:https";
import { ConnectionError } from "./types";

const HOSTS = new Set(["api.wise.com", "api.binance.com", "ndcdyn.interactivebrokers.com"]);

/** GET-only, fixed hosts, no redirects, bounded time/body. URLs with tokens are never logged. */
export function readText(url: URL, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<string> {
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname) || url.port || url.username || url.password) {
    throw new ConnectionError("Unsupported account API address.");
  }
  return new Promise((resolve, reject) => {
    const request = get(url, {
      headers: { accept: "application/json, application/xml, text/plain", "User-Agent": "PersonalFinanceDashboard/1.0", ...headers },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status !== 200) {
        response.resume();
        const message = status === 401 || status === 403
          ? "Account access was denied. Check the credential, account eligibility, and allowed server IPs."
          : status === 429 || status === 418
            ? "The provider rate limit was reached. Wait a few minutes and retry."
            : status === 451
              ? "This provider is unavailable from the server's region."
              : `The account provider returned HTTP ${status}. Try again later.`;
        reject(new ConnectionError(message));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8_000_000) {
          request.destroy();
          reject(new ConnectionError("The account report is too large. Use a single-day report."));
        } else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", () => reject(new ConnectionError("The account response was interrupted. Try again.")));
    });
    request.on("error", () => reject(new ConnectionError("The account provider could not be reached in time. Try again.")));
  });
}

export async function readJson(url: URL, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
  try {
    return JSON.parse(await readText(url, headers, signal));
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("The account provider returned an unreadable response. Previous balances were kept.");
  }
}
