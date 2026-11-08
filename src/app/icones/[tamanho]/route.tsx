import { ImageResponse } from "next/og";

const TAMANHOS = [180, 192, 512];

// Ícone provisório gerado na hora (marca definitiva entra depois).
export async function GET(_: Request, { params }: RouteContext<"/icones/[tamanho]">) {
  const tamanho = Number((await params).tamanho);
  if (!TAMANHOS.includes(tamanho)) return new Response("Não encontrado", { status: 404 });
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171717",
          color: "#ffffff",
          fontSize: tamanho * 0.5,
          fontWeight: 700,
        }}
      >
        C
      </div>
    ),
    { width: tamanho, height: tamanho },
  );
}
