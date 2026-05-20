import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

const TODAY = new Date();

function formatMoney(n) {
  if (!n || n === 0) return "—";
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(n);
}

function daysLeft(dateStr) {
  if (!dateStr || dateStr === "Aún no") return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - TODAY) / (1000 * 60 * 60 * 24));
}

function DeadlineBadge({ dateStr }) {
  const days = daysLeft(dateStr);

  let label, color;

  if (days === null) {
    label = "Aún no";
    color = "#64748b";
  } else if (days < 0) {
    label = "Vencida";
    color = "#ef4444";
  } else if (days <= 3) {
    label = `¡${days}d!`;
    color = "#f97316";
  } else if (days <= 7) {
    label = `${days} días`;
    color = "#eab308";
  } else {
    label = `${days} días`;
    color = "#22c55e";
  }

  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </span>
  );
}

function EstadoSubidaBadge({ value }) {
  const map = {
    "Aún no": { color: "#64748b", icon: "⏳" },
    "En proceso": { color: "#eab308", icon: "🔄" },
    "Subida": { color: "#3b82f6", icon: "✅" }
  };

  const { color, icon } = map[value] || {
    color: "#64748b",
    icon: "—"
  };

  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {icon} {value || "—"}
    </span>
  );
}

function ResultadoBadge({ value }) {
  const map = {
    Pendiente: { color: "#94a3b8", icon: "⏸" },
    Ganamos: { color: "#22c55e", icon: "🏆" },
    Perdimos: { color: "#ef4444", icon: "❌" }
  };

  const { color, icon } = map[value] || {
    color: "#64748b",
    icon: "—"
  };

  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 20,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {icon} {value || "—"}
    </span>
  );
}

export default function App() {
  const [offers, setOffers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "¡Hola! Soy tu asistente para el control de ofertas en Compras Públicas 🏛️\n\n" +
        "Puedo ayudarte a:\n" +
        "• **Agregar** una nueva oferta\n" +
        "• **Editar** cualquier dato\n" +
        "• **Consultar** o filtrar tus ofertas\n" +
        "• **Exportar** a Excel\n\n" +
        "Para estado de subida: *Aún no / En proceso / Subida*\n" +
        "Para resultado: *Pendiente / Ganamos / Perdimos*\n\n" +
        "¿Qué necesitas hoy?"
    }
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("chat");
  const [toast, setToast] = useState(null);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  useEffect(() => {
    fetchOffers();

    const channel = supabase
      .channel("ofertas-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ofertas"
        },
        () => {
          fetchOffers();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchOffers() {
    const { data, error } = await supabase
      .from("ofertas")
      .select("*")
      .order("id", { ascending: true });

    if (!error && data) setOffers(data);

    setLoadingData(false);
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });

    setTimeout(() => {
      setToast(null);
    }, 3000);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();

    setInput("");

    setMessages(prev => [
      ...prev,
      { role: "user", text: userMsg }
    ]);

    setLoading(true);

    const systemPrompt = `Eres un asistente inteligente para gestionar un control de ofertas de Compras Públicas (licitaciones en Ecuador).

Ofertas actuales:
${JSON.stringify(offers, null, 2)}

Fecha de hoy: ${TODAY.toISOString().split("T")[0]}

Campos de una oferta:
- id: número (solo para edit/delete, no incluir en add)
- entidad: texto
- proyecto: texto
- codigoProceso: texto
- monto: número USD
- montoOfertado: número USD
- fechaMaxima: fecha YYYY-MM-DD
- fechaSubida: fecha YYYY-MM-DD o "Aún no"
- fechaAdjudicacion: fecha YYYY-MM-DD o "Aún no"
- estadoSubida: "Aún no" | "En proceso" | "Subida"
- resultado: "Pendiente" | "Ganamos" | "Perdimos"

Responde en español, sé conciso y amigable.

Si hay que modificar datos, incluye:

<ACTION>
{"action":"add"|"edit"|"delete"|"none","data":{...}}
</ACTION>

Para "add":
todos los campos excepto id.

Defaults:
- estadoSubida="En proceso"
- fechaSubida="Aún no"
- fechaAdjudicacion="Aún no"
- codigoProceso=""
- resultado="Pendiente"
- montoOfertado=0

Si el usuario menciona "monto ofertado", guardarlo en montoOfertado.

Para "edit":
id + campos a cambiar.

Para "delete":
{"id":N}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          system: systemPrompt,
          messages: [
            ...messages.map(m => ({
              role:
                m.role === "assistant"
                  ? "assistant"
                  : "user",
              content: m.text
            })),
            {
              role: "user",
              content: userMsg
            }
          ]
        })
      });

      const data = await res.json();

      const raw =
        data.text ||
        "No pude procesar tu solicitud.";

      const actionMatch = raw.match(
        /<ACTION>([\s\S]*?)<\/ACTION>/
      );

      const displayText = raw
        .replace(/<ACTION>[\s\S]*?<\/ACTION>/g, "")
        .trim();

      if (actionMatch) {
        try {
          const parsed = JSON.parse(
            actionMatch[1].trim()
          );

          if (parsed.action === "add") {
            const { id: _id, ...fields } =
              parsed.data;

            const newOffer = {
              estadoSubida: "En proceso",
              fechaSubida: "Aún no",
              fechaAdjudicacion: "Aún no",
              codigoProceso: "",
              resultado: "Pendiente",
              montoOfertado: 0,
              ...fields
            };

            const { error } = await supabase
              .from("ofertas")
              .insert([newOffer]);

            if (error) throw error;

            showToast("✅ Oferta agregada");

            await fetchOffers();

          } else if (
            parsed.action === "edit" &&
            parsed.data?.id
          ) {
            const { id, ...fields } =
              parsed.data;

            const { error } = await supabase
              .from("ofertas")
              .update(fields)
              .eq("id", id);

            if (error) throw error;

            showToast("✏️ Oferta actualizada");

            await fetchOffers();

          } else if (
            parsed.action === "delete" &&
            parsed.data?.id
          ) {
            const { error } = await supabase
              .from("ofertas")
              .delete()
              .eq("id", parsed.data.id);

            if (error) throw error;

            showToast(
              "🗑️ Oferta eliminada",
              "error"
            );

            await fetchOffers();
          }

        } catch (e) {
          showToast(
            "Error al guardar: " + e.message,
            "error"
          );
        }
      }

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text: displayText
        }
      ]);

    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text:
            "Hubo un error al conectar. Intenta de nuevo."
        }
      ]);
    }

    setLoading(false);
  }

  function exportToCSV() {
    const headers = [
      "Nro",
      "Entidad",
      "Objeto del Contrato",
      "Código Proceso",
      "Monto (USD)",
      "Monto Ofertado (USD)",
      "Fecha Máx. Presentación",
      "Fecha Presentación",
      "Fecha Adjudicación",
      "Estado Subida",
      "Resultado"
    ];

    const rows = offers.map((o, i) => [
      i + 1,
      `"${o.entidad || ""}"`,
      `"${o.proyecto || ""}"`,
      o.codigoProceso || "",
      o.monto || 0,
      o.montoOfertado || 0,
      o.fechaMaxima || "",
      o.fechaSubida || "",
      o.fechaAdjudicacion || "",
      o.estadoSubida || "",
      o.resultado || ""
    ]);

    const csv = [headers, ...rows]
      .map(r => r.join(","))
      .join("\n");

    const blob = new Blob(
      ["\uFEFF" + csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );

    const a =
      document.createElement("a");

    a.href = URL.createObjectURL(blob);

    a.download =
      `control-ofertas-${TODAY
        .toISOString()
        .split("T")[0]}.csv`;

    a.click();

    showToast(
      "✅ CSV exportado correctamente"
    );

    setTab("chat");
  }

  function renderMarkdown(text) {
    return text
      .split("\n")
      .map((line, i) => {
        const html = line
          .replace(
            /\*\*(.*?)\*\*/g,
            "<strong>$1</strong>"
          )
          .replace(
            /\*(.*?)\*/g,
            "<em>$1</em>"
          );

        return (
          <span key={i}>
            <span
              dangerouslySetInnerHTML={{
                __html: html
              }}
            />
            <br />
          </span>
        );
      });
  }

  const urgent = offers.filter(o => {
    const d = daysLeft(
      o.fechaMaxima
    );

    return (
      d !== null &&
      d >= 0 &&
      d <= 5
    );
  });

  const ganadas = offers.filter(
    o => o.resultado === "Ganamos"
  ).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f2a4a 100%)",
        fontFamily:
          "'Segoe UI',system-ui,sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 16px"
      }}
    >
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 1000,
            background:
              toast.type === "error"
                ? "#ef444422"
                : "#22c55e22",
            border: `1px solid ${
              toast.type === "error"
                ? "#ef4444"
                : "#22c55e"
            }55`,
            color:
              toast.type === "error"
                ? "#ef4444"
                : "#22c55e",
            borderRadius: 12,
            padding: "12px 20px",
            fontWeight: 700,
            fontSize: 14
          }}
        >
          {toast.msg}
        </div>
      )}

      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          marginBottom: 20
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
            flexWrap: "wrap"
          }}
        >
          <img
            src="/logo.png"
            alt="Ingerecons"
            style={{
              height: 44,
              maxWidth: 180,
              objectFit: "contain"
            }}
          />

          <div>
            <div
              style={{
                color: "#f1f5f9",
                fontWeight: 800,
                fontSize: 20
              }}
            >
              Control de Ofertas
            </div>

            <div
              style={{
                color: "#64748b",
                fontSize: 12
              }}
            >
              Compras Públicas · Asistente IA · En vivo 🟢
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#1e293b",
            borderRadius: 10,
            padding: 4
          }}
        >
          {[
            ["chat", "💬 Asistente"],
            ["table", "📋 Ofertas"],
            ["export", "📊 Exportar"]
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 7,
                border: "none",
                cursor: "pointer",
                background:
                  tab === key
                    ? "linear-gradient(135deg,#3b82f6,#1d4ed8)"
                    : "transparent",
                color:
                  tab === key
                    ? "#fff"
                    : "#64748b",
                fontWeight: 600,
                fontSize: 13
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius:
                "16px 16px 0 0",
              border:
                "1px solid #334155",
              borderBottom: "none",
              height: 400,
              overflowY: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent:
                    m.role === "user"
                      ? "flex-end"
                      : "flex-start"
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding:
                      "10px 14px",
                    borderRadius:
                      m.role === "user"
                        ? "16px 4px 16px 16px"
                        : "4px 16px 16px 16px",
                    background:
                      m.role === "user"
                        ? "linear-gradient(135deg,#3b82f6,#1d4ed8)"
                        : "#0f172a",
                    color: "#f1f5f9",
                    fontSize: 14,
                    lineHeight: 1.6
                  }}
                >
                  {renderMarkdown(
                    m.text
                  )}
                </div>
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              background: "#1e293b",
              border:
                "1px solid #334155",
              borderRadius:
                "0 0 16px 16px",
              padding: 12
            }}
          >
            <input
              value={input}
              onChange={e =>
                setInput(
                  e.target.value
                )
              }
              onKeyDown={e =>
                e.key === "Enter" &&
                sendMessage()
              }
              placeholder="Escribe aquí..."
              style={{
                flex: 1,
                background: "#0f172a",
                border:
                  "1px solid #334155",
                borderRadius: 10,
                padding:
                  "10px 14px",
                color: "#f1f5f9",
                fontSize: 14,
                outline: "none"
              }}
            />

            <button
              onClick={sendMessage}
              disabled={
                loading ||
                !input.trim()
              }
              style={{
                background:
                  "linear-gradient(135deg,#3b82f6,#1d4ed8)",
                border: "none",
                borderRadius: 10,
                padding:
                  "10px 18px",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}

      {tab === "table" && (
        <div
          style={{
            width: "100%",
            maxWidth: 1100
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: 16,
              border:
                "1px solid #334155",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                overflowX: "auto"
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse:
                    "collapse",
                  fontSize: 12
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        "#0f172a"
                    }}
                  >
                    {[
                      "Nro",
                      "Entidad",
                      "Objeto del Contrato",
                      "Código",
                      "Monto",
                      "Monto Ofertado",
                      "Fecha Máx. Presentación",
                      "Fecha Presentación",
                      "Fecha Adjudicación",
                      "Estado Subida",
                      "Resultado"
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding:
                            "12px 12px",
                          color:
                            "#64748b",
                          fontWeight: 700,
                          textAlign:
                            "left"
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {offers.map((o, i) => (
                    <tr key={o.id}>
                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {i + 1}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {o.entidad}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {o.proyecto}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {o.codigoProceso}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px",
                          color:
                            "#22c55e",
                          fontWeight: 700
                        }}
                      >
                        {formatMoney(
                          o.monto
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px",
                          color:
                            "#3b82f6",
                          fontWeight: 700
                        }}
                      >
                        {formatMoney(
                          o.montoOfertado
                        )}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        <DeadlineBadge
                          dateStr={
                            o.fechaMaxima
                          }
                        />
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {o.fechaSubida}
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        {
                          o.fechaAdjudicacion
                        }
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        <EstadoSubidaBadge
                          value={
                            o.estadoSubida
                          }
                        />
                      </td>

                      <td
                        style={{
                          padding:
                            "10px 12px"
                        }}
                      >
                        <ResultadoBadge
                          value={
                            o.resultado
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "export" && (
        <div
          style={{
            width: "100%",
            maxWidth: 1100
          }}
        >
          <div
            style={{
              background: "#1e293b",
              borderRadius: 16,
              border:
                "1px solid #334155",
              padding: 32,
              textAlign: "center"
            }}
          >
            <div
              style={{
                fontSize: 48,
                marginBottom: 16
              }}
            >
              📊
            </div>

            <div
              style={{
                color: "#f1f5f9",
                fontWeight: 700,
                fontSize: 20,
                marginBottom: 8
              }}
            >
              Exportar a Excel
            </div>

            <button
              onClick={exportToCSV}
              style={{
                background:
                  "linear-gradient(135deg,#22c55e,#16a34a)",
                border: "none",
                borderRadius: 12,
                padding:
                  "14px 32px",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer"
              }}
            >
              ⬇️ Descargar CSV
            </button>
          </div>
        </div>
      )}

      <style>{`
        button:hover{
          filter:brightness(1.12);
        }

        input:focus{
          border-color:#3b82f6!important;
          box-shadow:0 0 0 2px #3b82f622;
        }

        ::-webkit-scrollbar{
          width:6px
        }

        ::-webkit-scrollbar-track{
          background:#0f172a
        }

        ::-webkit-scrollbar-thumb{
          background:#334155;
          border-radius:3px
        }
      `}</style>
    </div>
  );
}
