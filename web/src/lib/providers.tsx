"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-provider";
import { InstanceChrome } from "@/components/instance-chrome";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30000, retry: 1 } }
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <InstanceChrome />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
