// Só serviços de push dos navegadores: o servidor faz POST nesse endereço, então nada de URL livre (SSRF).
const SERVICOS_PUSH = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function endpointPermitido(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && SERVICOS_PUSH.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}
