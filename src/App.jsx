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

    setTimeout(() => setToast(null), 3000);
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

    const systemPrompt = `
Eres un asistente inteligente para gestionar un control de ofertas de Compras Públicas (licitaciones en Ecuador).

Ofertas actuales:
${JSON.stringify(offers, null, 2)}

Fecha de hoy:
${TODAY.toISOString().split("T")[0]}

Campos de una oferta:
- id: número
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

Responde en español.
`;

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

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          text: raw
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
      o.entidad || "",
      o.proyecto || "",
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
        type: "text/csv;charset=utf-8;"
      }
    );

    const a = document.createElement("a");

    a.href = URL.createObjectURL(blob);

    a.download = `control-ofertas-${
      TODAY.toISOString().split("T")[0]
    }.csv`;

    a.click();

    showToast(
      "✅ CSV exportado correctamente"
    );

    setTab("chat");
  }

  function renderMarkdown(text) {
    return text.split("\n").map((line, i) => {
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
    const d = daysLeft(o.fechaMaxima);

    return d !== null && d >= 0 && d <= 5;
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
      <div
        style={{
          width: "100%",
          maxWidth: 1100
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "#1e293b",
            borderRadius: 10,
            padding: 4,
            marginBottom: 20
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
                fontWeight: 600
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "table" && (
          <div
            style={{
              background: "#1e293b",
              borderRadius: 16,
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
                  borderCollapse: "collapse",
                  fontSize: 12
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#0f172a"
                    }}
                  >
                    {[
                      "Nro",
                      "Entidad",
                      "Objeto del Contrato",
                      "Código",
                      "Monto",
                      "Monto Ofertado",
                      "Fecha Máx.",
                      "Fecha Presentación",
                      "Fecha Adjudicación",
                      "Estado",
                      "Resultado"
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding:
                            "12px 12px",
                          color: "#64748b",
                          textAlign: "left"
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
                      <td>{i + 1}</td>

                      <td>{o.entidad}</td>

                      <td>{o.proyecto}</td>

                      <td>
                        {o.codigoProceso}
                      </td>

                      <td>
                        {formatMoney(o.monto)}
                      </td>

                      <td>
                        {formatMoney(
                          o.montoOfertado
                        )}
                      </td>

                      <td>
                        <DeadlineBadge
                          dateStr={
                            o.fechaMaxima
                          }
                        />
                      </td>

                      <td>
                        {o.fechaSubida}
                      </td>

                      <td>
                        {
                          o.fechaAdjudicacion
                        }
                      </td>

                      <td>
                        <EstadoSubidaBadge
                          value={
                            o.estadoSubida
                          }
                        />
                      </td>

                      <td>
                        <ResultadoBadge
                          value={o.resultado}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
