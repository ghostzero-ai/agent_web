export type AppNavigationMode = "path" | "hash";

let navigationMode: AppNavigationMode = "path";

export function configureAppNavigation(mode: AppNavigationMode): void {
  navigationMode = mode;
}

export function appHref(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return navigationMode === "hash" ? `#${path}` : path;
}

export function navigateToAppPath(path: string): void {
  const href = appHref(path);
  if (navigationMode === "hash") {
    window.location.hash = href.slice(1);
  } else {
    window.location.assign(href);
  }
}

export function currentAppSearchParams(location = window.location): URLSearchParams {
  if (navigationMode !== "hash") return new URLSearchParams(location.search);
  const route = location.hash.replace(/^#/, "") || "/chat";
  return new URL(route, "https://app.local").searchParams;
}
