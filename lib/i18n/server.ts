import { cookies } from "next/headers";
import { localeCookie, resolveLocale } from "./index";

export async function getRequestLocale() {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(localeCookie)?.value);
}
