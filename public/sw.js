// Service worker do CRM: só mostra notificações push (sem cache offline).
self.addEventListener("push", (event) => {
  const aviso = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "CRM", {
      body: aviso.texto || "",
      icon: "/icones/192",
      badge: "/icones/192",
      data: { link: aviso.link || "/avisos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let destino = new URL(event.notification.data?.link || "/avisos", self.location.origin);
  // Só abre páginas do próprio CRM.
  if (destino.origin !== self.location.origin) destino = new URL("/avisos", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) return janela.navigate(destino.href).then((j) => (j || janela).focus());
      }
      return self.clients.openWindow(destino.href);
    }),
  );
});
