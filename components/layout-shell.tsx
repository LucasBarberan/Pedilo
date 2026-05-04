"use client";

import { DeveloperFooter } from "@/components/developer-footer";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div id="app-scroll" className="flex-1 overflow-auto flex flex-col">
      {children}
      <DeveloperFooter />
    </div>
  );
}
