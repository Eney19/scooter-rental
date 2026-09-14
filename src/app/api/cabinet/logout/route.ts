import { NextResponse } from "next/server";
import { CABINET_COOKIE_NAME } from "@/lib/cabinet-session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(CABINET_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
