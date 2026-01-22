import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: { trackingToken: string } }
) {
    const { trackingToken } = params;

    try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
        const res = await fetch(`${backendUrl}/orders/track/${trackingToken}`);
        console.log(res)
        if (!res.ok) {
            if (res.status === 404) {
                return NextResponse.json(
                    { error: "Order not found" },
                    { status: 404 }
                );
            }
            return NextResponse.json(
                { error: "Backend error" },
                { status: res.status }
            );
        }

        const json = await res.json();
        console.log("JSON from backend:", json);

        // Extract data if backend wraps response in { success, data }
        const orderData = json.data || json;
        console.log("Order data to return:", orderData);

        const response = NextResponse.json(orderData);

        // Disable caching for tracking endpoint
        response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");

        return response;
    } catch (error) {
        console.error("Error fetching order from backend:", error);
        return NextResponse.json(
            { error: "Failed to fetch order" },
            { status: 500 }
        );
    }
}
