// public/sw.js — 나비 웹푸시 서비스 워커 (웹 루트에 두세요: /sw.js)

self.addEventListener("push", (event) => {
  const data = (() => { try { return event.data.json(); } catch { return {}; } })();
  event.waitUntil(
    self.registration.showNotification(data.title || "나비", {
      body: data.body || "오늘의 브리핑이 도착했어요",
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: { url: data.url || "/today" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((list) => {
      const url = event.notification.data.url;
      for (const c of list) if (c.url.includes(url) && "focus" in c) return c.focus();
      return clients.openWindow(url);
    })
  );
});
