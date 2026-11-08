import { describe, expect, test } from "vitest";
import { endpointPermitido } from "./push";

describe("endpointPermitido", () => {
  test("aceita serviços de push dos navegadores", () => {
    expect(endpointPermitido("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(endpointPermitido("https://web.push.apple.com/QGx")).toBe(true);
    expect(endpointPermitido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(endpointPermitido("https://wns2-by3p.notify.windows.com/w/?token=x")).toBe(true);
  });
  test("recusa http, rede interna e imitações", () => {
    expect(endpointPermitido("http://fcm.googleapis.com/x")).toBe(false);
    expect(endpointPermitido("https://127.0.0.1/x")).toBe(false);
    expect(endpointPermitido("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(endpointPermitido("https://evilpush.apple.com.br/x")).toBe(false);
    expect(endpointPermitido("lixo")).toBe(false);
  });
});
