import { NextResponse } from "next/server";

const SECURE_COOKIE = process.env.COOKIE_SECURE === "true";
const COOKIE_NAME = "pedilo_test_token";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    expires: new Date(0),
  });
  return res;
}
