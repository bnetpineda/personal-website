import { redirect } from "next/navigation";

/** Settings was split up: categories have their own page, backup and sign-in moved to the account menu. Old links land on Categories. */
export default function SettingsPage() {
  redirect("/admin/categories");
}
