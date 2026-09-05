"use client";

import { useEffect } from "react";
import { clearLegacyBrowserApiConfig } from "@/lib/config";

export function LegacyApiConfigCleanup() {
  useEffect(() => {
    clearLegacyBrowserApiConfig();
  }, []);

  return null;
}
