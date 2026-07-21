import { NextResponse } from "next/server";

const SECURE_COOKIE = process.env.COOKIE_SECURE === "true";
const COOKIE_NAME = "pedilo_test_token";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h, igual al JWT del backend

export async function POST(req: Request) {
  try {
    const { username, pin } = await req.json();

    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, pin }),
      cache: "no-store",
    });

    const data = await r.json();
    const token: string | undefined = data?.data?.token;
    const schema: string | undefined = data?.data?.user?.schema;

    // Mismo mensaje para PIN inválido Y para credenciales válidas de un usuario
    // que no es TEST — así no se filtra que el form distingue entre ambos casos.
    if (!r.ok || !data?.success || !token || schema !== "TEST") {
      return NextResponse.json(
        { success: false, error: "Usuario o PIN incorrecto" },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE_COOKIE,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Error de conexión" },
      { status: 500 }
    );
  }
}
