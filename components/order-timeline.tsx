import { Check, Clock, ChefHat, Truck, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "current" | "completed";

export type OrderState = "PENDING" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELED";

interface TimelineStepProps {
    icon: React.ElementType;
    label: string;
    status: StepStatus;
    isLast?: boolean;
}

function TimelineStep({ icon: Icon, label, status, isLast }: TimelineStepProps) {
    return (
        <div className="flex flex-col items-center relative flex-1">
            {/* Line connector */}
            {!isLast && (
                <div
                    className={cn(
                        "absolute top-5 left-[50%] right-[-50%] h-[2px] w-full z-0",
                        status === "completed" ? "bg-[var(--brand-color)]" : "bg-gray-200"
                    )}
                />
            )}

            {/* Circle */}
            <div
                className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center z-10 transition-colors duration-300 border-2",
                    status === "completed" || status === "current"
                        ? "bg-[var(--brand-color)] border-[var(--brand-color)] text-white"
                        : "bg-white border-gray-200 text-gray-400"
                )}
            >
                <Icon className="w-5 h-5" />
            </div>

            {/* Label */}
            <span
                className={cn(
                    "mt-2 text-xs text-center font-medium transition-colors duration-300 px-1",
                    status === "current" ? "text-[var(--brand-color)]" : "text-gray-500",
                    status === "completed" && "text-gray-900"
                )}
            >
                {label}
            </span>
        </div>
    );
}

interface OrderTimelineProps {
    status: OrderState;
    type: "DELIVERY" | "TAKEAWAY";
}

export default function OrderTimeline({ status, type }: OrderTimelineProps) {
    // Mapping logic
    // 1. Pending (Todos)
    // 2. Preparing (Todos)
    // 3. Ready (Takeaway: Listo para retirar / Delivery: Preparado)
    // 4. Completed (Takeaway: Entregado / Delivery: En camino -> Entregado logic handled by parent state usually, but visuals here)

    const steps = [
        { id: "PENDING", label: "Pendiente", icon: Clock },
        { id: "PREPARING", label: "En preparación", icon: ChefHat },
        {
            id: "READY",
            label: type === "DELIVERY" ? "Preparado" : "Listo p/ retirar",
            icon: ShoppingBag
        },
        {
            id: "COMPLETED",
            label: type === "DELIVERY" ? "En camino" : "Entregado",
            icon: type === "DELIVERY" ? Truck : Check
        },
    ];

    // Determine active step index
    /*
      PENDING -> index 0 (current)
      PREPARING -> index 1 (current), 0 completed
      READY -> index 2 (current), 0-1 completed
      OUT_FOR_DELIVERY -> index 3 (current for delivery), 0-2 completed
      DELIVERED -> All completed
    */

    let currentIndex = 0;
    if (status === "PREPARING") currentIndex = 1;
    if (status === "READY") currentIndex = 2;
    if (status === "OUT_FOR_DELIVERY") currentIndex = 3;
    if (status === "DELIVERED") currentIndex = 4; // All completed
    if (status === "CANCELED") currentIndex = -1; // Special case

    if (currentIndex === -1) return null; // Or handle canceled differently

    return (
        <div className="flex w-full justify-between items-start mt-8 mb-8">
            {steps.map((step, index) => {
                let stepStatus: StepStatus = "pending";
                if (index < currentIndex) stepStatus = "completed";
                if (index === currentIndex) stepStatus = "current";
                // Visual fix: if delivered (idx 4), last step is completed
                if (currentIndex === 4 && index === 3) stepStatus = "completed";

                return (
                    <TimelineStep
                        key={step.id}
                        icon={step.icon}
                        label={step.label}
                        status={stepStatus}
                        isLast={index === steps.length - 1}
                    />
                );
            })}
        </div>
    );
}
