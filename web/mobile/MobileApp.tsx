import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { AppLink } from "@/components/platform/AppLink";
import { NativeNotificationBridge } from "@/components/platform/NativeNotificationBridge";
import { apiFetch, getApiBaseUrl } from "@/lib/api/clientRuntime";

type MobileRoute = "/chat" | "/tasks" | "/inbox" | "/notifications" | "/api-key";

const ROUTES: Record<MobileRoute, LazyExoticComponent<ComponentType>> = {
  "/chat": lazy(() => import("@/app/chat/page")),
  "/tasks": lazy(() => import("@/app/tasks/page")),
  "/inbox": lazy(() => import("@/app/inbox/page")),
  "/notifications": lazy(() => import("@/app/notifications/page")),
  "/api-key": lazy(() => import("@/app/api-key/page")),
};

function currentRoute(): string {
  const raw = window.location.hash.replace(/^#/, "") || "/chat";
  try {
    return new URL(raw, "https://app.local").pathname;
  } catch {
    return "/chat";
  }
}

export function MobileApp() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/chat");
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  const Page = ROUTES[route as MobileRoute];

  return (
    <>
      <NativeNotificationBridge />
      <ServerConnectionStatus />
      <Suspense fallback={<MobilePageLoading />}>
        {Page ? <Page /> : <UnknownMobileRoute />}
      </Suspense>
    </>
  );
}

function ServerConnectionStatus() {
  const [state, setState] = useState<"checking" | "online" | "offline">(
    "checking",
  );

  const check = async () => {
    setState("checking");
    setState(await probeServer());
  };

  useEffect(() => {
    let active = true;
    void probeServer().then((nextState) => {
      if (active) setState(nextState);
    });
    const recheck = () => void check();
    window.addEventListener("online", recheck);
    return () => {
      active = false;
      window.removeEventListener("online", recheck);
    };
  }, []);

  if (state === "online") return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-xl backdrop-blur dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100">
      <div className="min-w-0">
        <p className="font-medium">
          {state === "checking" ? "正在连接笔记本服务端…" : "本地界面可用，服务端暂时离线"}
        </p>
        <p className="truncate text-xs opacity-70">{getApiBaseUrl()}</p>
      </div>
      <button
        type="button"
        onClick={() => void check()}
        disabled={state === "checking"}
        className="shrink-0 rounded-lg border border-current px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        重试
      </button>
    </div>
  );
}

async function probeServer(): Promise<"online" | "offline"> {
  try {
    const response = await apiFetch("/api/v1/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

function MobilePageLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-black dark:text-zinc-400">
      正在载入页面…
    </main>
  );
}

function UnknownMobileRoute() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">页面不存在</h1>
      <AppLink href="/chat" className="mt-4 text-blue-600 underline dark:text-blue-400">
        返回对话
      </AppLink>
    </main>
  );
}

export function MobileConfigurationError({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
      <p className="text-xs font-medium uppercase tracking-widest text-amber-300">Mobile Client</p>
      <h1 className="mt-3 text-2xl font-semibold">本地客户端配置不完整</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-300">{message}</p>
      <p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">
        请使用项目的一键本地 APK 构建脚本，并提供笔记本的 Tailscale HTTPS 地址。
      </p>
    </main>
  );
}
