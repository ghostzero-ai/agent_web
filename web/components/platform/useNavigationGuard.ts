"use client";

import { useEffect, useId } from "react";
import { isNavigationApproved, registerNavigationGuard } from "@/lib/platform/navigationGuard";

export function useNavigationGuard(active: boolean, message = "当前页面有未保存的输入，离开后需要重新输入。") {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    const unregister = registerNavigationGuard(id, message);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isNavigationApproved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [active, id, message]);
}
