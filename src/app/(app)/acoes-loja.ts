"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_LOJA } from "@/lib/sessao";

export async function trocarLoja(lojaId: string) {
  (await cookies()).set(COOKIE_LOJA, lojaId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  revalidatePath("/", "layout");
}
