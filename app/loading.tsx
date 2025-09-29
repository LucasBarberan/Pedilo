import SiteHeader from "@/components/site-header";
import ClosedBanner from "@/components/closed-banner";
import BlockingLoader from "@/components/blocking-loader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background relative">
      <SiteHeader showBack />
      <div className="h-[6px] w-full bg-white" />
      <ClosedBanner />
      <BlockingLoader open message="Preparando la carta..." />
    </div>
  );
}
