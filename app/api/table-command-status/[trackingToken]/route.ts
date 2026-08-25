import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: { trackingToken: string } }
) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/tables/public/commands/${encodeURIComponent(params.trackingToken)}`,
      { cache: "no-store" }
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "No se pudo conectar con el sistema de mesas" },
      { status: 502 }
    );
  }
}
