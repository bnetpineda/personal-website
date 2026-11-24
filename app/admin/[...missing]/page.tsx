import { notFound } from "next/navigation";
import { connection } from "next/server";

/*
 * Unknown /admin paths. Rendering the 404 per request lets it carry the admin CSP nonce, so its
 * scripts run; the static root 404 has no nonce and wouldn't hydrate under that policy.
 */
export default async function MissingAdminPage() {
  await connection();
  notFound();
}
