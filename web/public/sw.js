/* global self, clients */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const inboxItemId = typeof payload.inboxItemId === "string" ? payload.inboxItemId : null;
  const title = typeof payload.title === "string" ? payload.title : "AI Study Companion";
  const body = typeof payload.body === "string" ? payload.body : "你有一条新的提醒。";
  const targetUrl = inboxItemId
    ? `/inbox?highlight=${encodeURIComponent(inboxItemId)}`
    : "/inbox";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: inboxItemId ? `inbox-${inboxItemId}` : "agent-web-reminder",
      renotify: false,
      data: { url: targetUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/inbox";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          if ("navigate" in client) void client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
