import { NextResponse } from "next/server";

export async function GET(
    request: Request,
    { params }: { params: { trackingToken: string } }
) {
    const { trackingToken } = params;

    // Mock logic to simulate different states based on the token
    // Current time for reference
    const now = new Date();

    let orderData = {
        orderNumber: 12345,
        type: "DELIVERY", // DELIVERY | TAKEAWAY
        clientStatus: "PENDING", // PENDING | PREPARING | READY | OUT_FOR_DELIVERY | DELIVERED | CANCELED
        createdAt: new Date(now.getTime() - 30 * 60000).toISOString(), // 30 mins ago
        completedAt: null as string | null,
        cancelled: false,
    };

    // Simulating states based on token keywords for testing purposes
    // 1. Determine Type
    if (trackingToken.includes("takeaway")) {
        orderData.type = "TAKEAWAY";
    }

    // 2. Determine Status
    if (trackingToken.includes("pending")) {
        orderData.clientStatus = "PENDING";
    } else if (trackingToken.includes("preparing")) {
        orderData.clientStatus = "PREPARING";
    } else if (trackingToken.includes("ready")) {
        orderData.clientStatus = "READY";
    } else if (trackingToken.includes("way") && orderData.type !== "TAKEAWAY") {
        orderData.clientStatus = "OUT_FOR_DELIVERY";
        orderData.completedAt = new Date(now.getTime() - 10 * 60000).toISOString();
    } else if (trackingToken.includes("delivered")) {
        orderData.clientStatus = "DELIVERED";
        orderData.completedAt = new Date(now.getTime() - 90 * 60000).toISOString();
    } else if (trackingToken.includes("canceled")) {
        orderData.clientStatus = "CANCELED";
        orderData.cancelled = true;
    } else if (trackingToken.includes("notfound")) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
    } else if (orderData.type === "TAKEAWAY" && trackingToken.includes("completed")) {
        // Special case for takeaway completed logic test
        orderData.clientStatus = "DELIVERED";
        orderData.completedAt = new Date(now.getTime() - 10 * 60000).toISOString();
    } else {
        // Default
        orderData.clientStatus = "PENDING";
    }

    return NextResponse.json(orderData);
}
