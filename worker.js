/**
 * Proxy de curadoria por IA para o app Roteiro de Viagem.
 *
 * COMO PUBLICAR (leva uns 10 minutos, tudo pelo navegador)
 * 1. Entre em dash.cloudflare.com e crie uma conta gratuita.
 * 2. Menu Workers & Pages, botao Create, opcao Worker. De um nome, por exemplo "roteiro-ia".
 * 3. Clique em Edit code, apague o exemplo, cole este arquivo inteiro e clique Deploy.
 * 4. Volte ao Worker, aba Settings, secao Variables and Secrets:
 *    - Adicione um Secret chamado ANTHROPIC_API_KEY com a sua chave da Anthropic.
 *    - Adicione uma Variable chamada ORIGENS com o seu dominio, por exemplo:
 *      https://borbacana-cyber.github.io
 *      Para varios dominios, separe por virgula.
 * 5. Copie o endereco do Worker (algo como https://roteiro-ia.SEUNOME.workers.dev)
 *    e cole no bloco CONFIG do index.html, no campo ia.url.
 *
 * A chave da Anthropic fica somente aqui dentro. O app nunca a enxerga,
 * mesmo com o repositorio publico.
 */

const MODELOS_PERMITIDOS = ["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-5"];
const MODELO_PADRAO = "claude-sonnet-5";
const LIMITE_CARACTERES = 24000;

export default {
  async fetch(pedido, env) {
    const origem = pedido.headers.get("Origin") || "";
    const permitidas = (env.ORIGENS || "").split(",").map(s => s.trim()).filter(Boolean);
    const liberada = permitidas.length === 0 || permitidas.indexOf(origem) >= 0;

    const cabecalhos = {
      "Access-Control-Allow-Origin": liberada && origem ? origem : (permitidas[0] || "*"),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Content-Type": "application/json; charset=utf-8"
    };

    if (pedido.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhos });

    if (!liberada) {
      return new Response(JSON.stringify({ erro: "Origem nao autorizada" }), { status: 403, headers: cabecalhos });
    }
    if (pedido.method !== "POST") {
      return new Response(JSON.stringify({ erro: "Use POST" }), { status: 405, headers: cabecalhos });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ erro: "Falta configurar ANTHROPIC_API_KEY no Worker" }), { status: 500, headers: cabecalhos });
    }

    let corpo;
    try { corpo = await pedido.json(); }
    catch (e) { return new Response(JSON.stringify({ erro: "Corpo invalido" }), { status: 400, headers: cabecalhos }); }

    const pergunta = String(corpo.pergunta || "");
    if (!pergunta) {
      return new Response(JSON.stringify({ erro: "Faltou a pergunta" }), { status: 400, headers: cabecalhos });
    }
    if (pergunta.length > LIMITE_CARACTERES) {
      return new Response(JSON.stringify({ erro: "Pedido grande demais" }), { status: 413, headers: cabecalhos });
    }

    const modelo = MODELOS_PERMITIDOS.indexOf(corpo.modelo) >= 0 ? corpo.modelo : MODELO_PADRAO;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 4000,
          system: "Voce e um guia local que conhece o destino de dentro. Responde sempre em portugues do Brasil, "
            + "de forma direta e sem linguagem de folheto turistico. Quando o pedido exigir JSON, "
            + "voce responde apenas com o JSON, sem texto antes ou depois, sem marcadores de codigo.",
          messages: [{ role: "user", content: pergunta }]
        })
      });

      if (!r.ok) {
        const detalhe = await r.text();
        return new Response(JSON.stringify({ erro: "A IA recusou o pedido", status: r.status, detalhe: detalhe.slice(0, 300) }), { status: 502, headers: cabecalhos });
      }

      const j = await r.json();
      const texto = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      return new Response(JSON.stringify({ texto: texto, modelo: modelo }), { status: 200, headers: cabecalhos });
    } catch (e) {
      return new Response(JSON.stringify({ erro: "Falha ao falar com a IA" }), { status: 502, headers: cabecalhos });
    }
  }
};
