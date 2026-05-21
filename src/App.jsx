import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

const TODAY = new Date();

function formatMoney(n) {
  if (!n || n === 0) return "—";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
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
  if (days === null) { label = "Aún no"; color = "#64748b"; }
  else if (days < 0) { label = "Vencida"; color = "#ef4444"; }
  else if (days <= 3) { label = `¡${days}d!`; color = "#f97316"; }
  else if (days <= 7) { label = `${days} días`; color = "#eab308"; }
  else { label = `${days} días`; color = "#22c55e"; }
  return <span style={{ background: color+"22", color, border:`1px solid ${color}55`, borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>{label}</span>;
}

function EstadoSubidaBadge({ value }) {
  const map = { "Aún no":{ color:"#64748b", icon:"⏳" }, "En proceso":{ color:"#eab308", icon:"🔄" }, "Subida":{ color:"#3b82f6", icon:"✅" } };
  const { color, icon } = map[value] || { color:"#64748b", icon:"—" };
  return <span style={{ background:color+"22", color, border:`1px solid ${color}55`, borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>{icon} {value||"—"}</span>;
}

function ResultadoBadge({ value }) {
  const map = { "Pendiente":{ color:"#94a3b8", icon:"⏸" }, "Ganamos":{ color:"#22c55e", icon:"🏆" }, "Perdimos":{ color:"#ef4444", icon:"❌" } };
  const { color, icon } = map[value] || { color:"#64748b", icon:"—" };
  return <span style={{ background:color+"22", color, border:`1px solid ${color}55`, borderRadius:20, padding:"2px 10px", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>{icon} {value||"—"}</span>;
}

export default function App() {
  const [offers, setOffers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [messages, setMessages] = useState([{
    role: "assistant",
    text: "¡Hola! Soy tu asistente para el control de ofertas en Compras Públicas 🏛️\n\nPuedo ayudarte a:\n• **Agregar** una nueva oferta\n• **Editar** cualquier dato\n• **Consultar** o filtrar tus ofertas\n• **Exportar** a Excel\n\nPara estado de subida: *Aún no / En proceso / Subida*\nPara resultado: *Pendiente / Ganamos / Perdimos*\n\n¿Qué necesitas hoy?"
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("chat");
  const [toast, setToast] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  useEffect(() => {
    fetchOffers();
    const channel = supabase
      .channel("ofertas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "ofertas" }, () => { fetchOffers(); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchOffers() {
    const { data, error } = await supabase.from("ofertas").select("*").order("id", { ascending: true });
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
    setMessages(prev => [...prev, { role:"user", text:userMsg }]);
    setLoading(true);

    const systemPrompt = `Eres un asistente inteligente para gestionar un control de ofertas de Compras Públicas (licitaciones en Ecuador).

Ofertas actuales:
${JSON.stringify(offers, null, 2)}

Fecha de hoy: ${TODAY.toISOString().split("T")[0]}

Campos de una oferta:
- id: número (solo para edit/delete, no incluir en add)
- entidad: texto (entidad que contrata)
- proyecto: texto (objeto del contrato)
- codigoProceso: texto (código del proceso licitatorio)
- monto: número USD (monto referencial de la entidad)
- montoOfertado: número USD (monto que oferta Ingerecons, puede ser diferente al referencial)
- fechaMaxima: fecha YYYY-MM-DD (fecha máxima de presentación)
- fechaSubida: fecha YYYY-MM-DD o "Aún no" (fecha de presentación)
- fechaAdjudicacion: fecha YYYY-MM-DD o "Aún no" (fecha estimada de adjudicación)
- estadoSubida: "Aún no" | "En proceso" | "Subida"
- resultado: "Pendiente" | "Ganamos" | "Perdimos"

Responde en español, sé conciso y amigable.
Si hay que modificar datos, incluye al final:

<ACTION>
{"action":"add"|"edit"|"delete"|"none","data":{...}}
</ACTION>

Para "add": todos los campos excepto id (defaults: estadoSubida="En proceso", fechaSubida="Aún no", fechaAdjudicacion="Aún no", codigoProceso="", monto=0, montoOfertado=0, resultado="Pendiente").
Para "edit": id + campos a cambiar.
Para "delete": {"id":N}.`;

    try {
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          system: systemPrompt,
          messages:[
            ...messages.map(m=>({ role:m.role==="assistant"?"assistant":"user", content:m.text })),
            { role:"user", content:userMsg }
          ]
        })
      });
      const data = await res.json();
      const raw = data.text || "No pude procesar tu solicitud.";
      const actionMatch = raw.match(/<ACTION>([\s\S]*?)<\/ACTION>/);
      const displayText = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/g,"").trim();

      if (actionMatch) {
        try {
          const parsed = JSON.parse(actionMatch[1].trim());
          if (parsed.action === "add") {
            const { id: _id, ...fields } = parsed.data;
            const newOffer = { estadoSubida:"En proceso", fechaSubida:"Aún no", fechaAdjudicacion:"Aún no", codigoProceso:"", monto:0, montoOfertado:0, resultado:"Pendiente", ...fields };
            const { error } = await supabase.from("ofertas").insert([newOffer]);
            if (error) throw error;
            showToast("✅ Oferta agregada");
            await fetchOffers();
          } else if (parsed.action === "edit" && parsed.data?.id) {
            const { id, ...fields } = parsed.data;
            const { error } = await supabase.from("ofertas").update(fields).eq("id", id);
            if (error) throw error;
            showToast("✏️ Oferta actualizada");
            await fetchOffers();
          } else if (parsed.action === "delete" && parsed.data?.id) {
            const { error } = await supabase.from("ofertas").delete().eq("id", parsed.data.id);
            if (error) throw error;
            showToast("🗑️ Oferta eliminada", "error");
            await fetchOffers();
          }
        } catch (e) {
          showToast("Error al guardar: " + e.message, "error");
        }
      }
      setMessages(prev => [...prev, { role:"assistant", text:displayText }]);
    } catch {
      setMessages(prev => [...prev, { role:"assistant", text:"Hubo un error al conectar. Intenta de nuevo." }]);
    }
    setLoading(false);
  }

  function exportToCSV() {
    const headers = ["Nro","Entidad","Objeto del Contrato","Código Proceso","Monto Ref. (USD)","Monto Ofertado (USD)","Fecha Máx. Presentación","Fecha Presentación","Fecha Adjudicación","Estado Subida","Resultado"];
    const rows = offers.map((o,i) => [i+1, `"${o.entidad||""}"`, `"${o.proyecto||""}"`, o.codigoProceso||"", o.monto||0, o.montoOfertado||0, o.fechaMaxima||"", o.fechaSubida||"", o.fechaAdjudicacion||"", o.estadoSubida||"", o.resultado||""]);
    const csv = [headers,...rows].map(r=>r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `control-ofertas-${TODAY.toISOString().split("T")[0]}.csv`;
    a.click();
    showToast("✅ CSV exportado correctamente");
    setTab("chat");
  }

  function renderMarkdown(text) {
    return text.split("\n").map((line,i)=>{
      const html = line.replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/\*(.*?)\*/g,"<em>$1</em>");
      return <span key={i}><span dangerouslySetInnerHTML={{__html:html}}/><br/></span>;
    });
  }

  const urgent = offers.filter(o=>{ const d=daysLeft(o.fechaMaxima); return d!==null&&d>=0&&d<=5; });
  const ganadas = offers.filter(o=>o.resultado==="Ganamos").length;

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f2a4a 100%)", fontFamily:"'Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 16px" }}>

      {toast && (
        <div style={{ position:"fixed", top:20, right:20, zIndex:1000, background:toast.type==="error"?"#ef444422":"#22c55e22", border:`1px solid ${toast.type==="error"?"#ef4444":"#22c55e"}55`, color:toast.type==="error"?"#ef4444":"#22c55e", borderRadius:12, padding:"12px 20px", fontWeight:700, fontSize:14, backdropFilter:"blur(10px)" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ width:"100%", maxWidth:1200, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
          <img src="/logo.png" alt="Ingerecons" style={{ height:44, maxWidth:180, objectFit:"contain", flexShrink:0 }} />
          <div>
            <div style={{ color:"#f1f5f9", fontWeight:800, fontSize:20, letterSpacing:-0.5 }}>Control de Ofertas</div>
            <div style={{ color:"#64748b", fontSize:12 }}>Compras Públicas · Asistente IA · En vivo 🟢</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ background:"#3b82f622", color:"#3b82f6", border:"1px solid #3b82f644", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700 }}>{offers.length} ofertas</span>
            {ganadas>0 && <span style={{ background:"#22c55e22", color:"#22c55e", border:"1px solid #22c55e44", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700 }}>🏆 {ganadas} ganadas</span>}
            {urgent.length>0 && <span style={{ background:"#f9731622", color:"#f97316", border:"1px solid #f9731644", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700 }}>⚠️ {urgent.length} urgente{urgent.length>1?"s":""}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:4, background:"#1e293b", borderRadius:10, padding:4 }}>
          {[["chat","💬 Asistente"],["table","📋 Ofertas"],["export","📊 Exportar"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{ flex:1, padding:"8px 0", borderRadius:7, border:"none", cursor:"pointer", background:tab===key?"linear-gradient(135deg,#3b82f6,#1d4ed8)":"transparent", color:tab===key?"#fff":"#64748b", fontWeight:600, fontSize:13, transition:"all 0.2s" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* CHAT */}
      {tab==="chat" && (
        <div style={{ width:"100%", maxWidth:1200, display:"flex", flexDirection:"column" }}>
          <div style={{ background:"#1e293b", borderRadius:"16px 16px 0 0", border:"1px solid #334155", borderBottom:"none", height:400, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:12 }}>
            {messages.map((m,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"80%", padding:"10px 14px", borderRadius:m.role==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px", background:m.role==="user"?"linear-gradient(135deg,#3b82f6,#1d4ed8)":"#0f172a", color:"#f1f5f9", fontSize:14, lineHeight:1.6, border:m.role==="assistant"?"1px solid #334155":"none" }}>
                  {renderMarkdown(m.text)}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display:"flex" }}>
                <div style={{ padding:"10px 16px", background:"#0f172a", borderRadius:"4px 16px 16px 16px", border:"1px solid #334155", color:"#64748b", fontSize:14, display:"flex", alignItems:"center", gap:5 }}>
                  Procesando
                  {[0,1,2].map(j=><span key={j} style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#3b82f6", animation:`bounce 1s ${j*0.2}s infinite` }}/>)}
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>
          <div style={{ display:"flex", gap:8, background:"#1e293b", border:"1px solid #334155", borderRadius:"0 0 16px 16px", padding:12 }}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} placeholder="Ej: Agrega oferta LICO-001, Municipio Quito, objeto pavimentación, vence 30 junio..." style={{ flex:1, background:"#0f172a", border:"1px solid #334155", borderRadius:10, padding:"10px 14px", color:"#f1f5f9", fontSize:14, outline:"none", fontFamily:"inherit" }}/>
            <button onClick={sendMessage} disabled={loading||!input.trim()} style={{ background:"linear-gradient(135deg,#3b82f6,#1d4ed8)", border:"none", borderRadius:10, padding:"10px 18px", color:"#fff", fontWeight:700, cursor:loading?"not-allowed":"pointer", opacity:loading?0.6:1, fontSize:18 }}>➤</button>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
            {["Agrega una nueva oferta","¿Cuáles ganamos?","¿Qué vence pronto?","Exportar a Excel"].map(q=>(
              <button key={q} onClick={()=>setInput(q)} style={{ background:"#1e293b", border:"1px solid #334155", borderRadius:20, padding:"6px 12px", color:"#94a3b8", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{q}</button>
            ))}
          </div>
        </div>
      )}

      {/* TABLE */}
      {tab==="table" && (
        <div style={{ width:"100%", maxWidth:1200 }}>
          {loadingData ? (
            <div style={{ textAlign:"center", padding:60, color:"#3b82f6", fontSize:16 }}>Cargando ofertas...</div>
          ) : (
            <>
              <div style={{ background:"#1e293b", borderRadius:16, border:"1px solid #334155", overflow:"hidden" }}>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#0f172a" }}>
                        {["Nro","Entidad","Objeto del Contrato","Código","Monto Ref.","Monto Ofertado","Fecha Máx. Presentación","Fecha Presentación","Fecha Adjudicación","Estado Subida","Resultado"].map(h=>(
                          <th key={h} style={{ padding:"12px 12px", color:"#64748b", fontWeight:700, textAlign:"left", whiteSpace:"nowrap", borderBottom:"1px solid #334155" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((o,i)=>(
                        <tr key={o.id} style={{ background:i%2===0?"transparent":"#0f172a33", borderBottom:"1px solid #1e293b" }}>
                          <td style={{ padding:"10px 12px", color:"#64748b", fontWeight:700 }}>{i+1}</td>
                          <td style={{ padding:"10px 12px", color:"#94a3b8", maxWidth:140 }}>
                            <a href="https://www.compraspublicas.gob.ec/ProcesoContratacion/compras/PC/buscarProceso.cpe?sg=1" target="_blank" rel="noreferrer" style={{ color:"#94a3b8", textDecoration:"none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block" }} title={o.entidad} onMouseEnter={e=>e.target.style.color="#3b82f6"} onMouseLeave={e=>e.target.style.color="#94a3b8"}>{o.entidad}</a>
                          </td>
                          <td style={{ padding:"10px 12px", color:"#e2e8f0", fontWeight:600, maxWidth:200 }}>
                            <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={o.proyecto}>{o.proyecto}</div>
                          </td>
                          <td style={{ padding:"10px 12px", color:"#64748b", whiteSpace:"nowrap" }}>{o.codigoProceso||"—"}</td>
                          <td style={{ padding:"10px 12px", color:"#22c55e", fontWeight:700, whiteSpace:"nowrap" }}>{formatMoney(o.monto)}</td>
                          <td style={{ padding:"10px 12px", color:"#3b82f6", fontWeight:700, whiteSpace:"nowrap" }}>{formatMoney(o.montoOfertado)}</td>
                          <td style={{ padding:"10px 12px" }}><DeadlineBadge dateStr={o.fechaMaxima}/></td>
                          <td style={{ padding:"10px 12px", color:o.fechaSubida==="Aún no"?"#475569":"#94a3b8", fontStyle:o.fechaSubida==="Aún no"?"italic":"normal", whiteSpace:"nowrap" }}>{o.fechaSubida||"Aún no"}</td>
                          <td style={{ padding:"10px 12px", color:o.fechaAdjudicacion==="Aún no"?"#475569":"#94a3b8", fontStyle:o.fechaAdjudicacion==="Aún no"?"italic":"normal", whiteSpace:"nowrap" }}>{o.fechaAdjudicacion||"Aún no"}</td>
                          <td style={{ padding:"10px 12px" }}><EstadoSubidaBadge value={o.estadoSubida}/></td>
                          <td style={{ padding:"10px 12px" }}><ResultadoBadge value={o.resultado}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {offers.length===0 && <div style={{ textAlign:"center", padding:40, color:"#475569" }}>No hay ofertas. Usa el asistente para agregar la primera.</div>}
              </div>
              <div style={{ display:"flex", gap:10, marginTop:12, flexWrap:"wrap" }}>
                {[
                  ["Total",offers.length,"#3b82f6"],
                  ["Monto ref. total",formatMoney(offers.reduce((s,o)=>s+(Number(o.monto)||0),0)),"#22c55e"],
                  ["Monto ofertado total",formatMoney(offers.reduce((s,o)=>s+(Number(o.montoOfertado)||0),0)),"#3b82f6"],
                  ["🏆 Ganamos",offers.filter(o=>o.resultado==="Ganamos").length,"#22c55e"],
                  ["❌ Perdimos",offers.filter(o=>o.resultado==="Perdimos").length,"#ef4444"],
                  ["⏸ Pendientes",offers.filter(o=>o.resultado==="Pendiente").length,"#94a3b8"],
                ].map(([label,val,color])=>(
                  <div key={label} style={{ flex:1, minWidth:100, background:"#1e293b", border:`1px solid ${color}33`, borderRadius:12, padding:"12px 14px", textAlign:"center" }}>
                    <div style={{ color, fontWeight:800, fontSize:17 }}>{val}</div>
                    <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* EXPORT */}
      {tab==="export" && (
        <div style={{ width:"100%", maxWidth:1200 }}>
          <div style={{ background:"#1e293b", borderRadius:16, border:"1px solid #334155", padding:32, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📊</div>
            <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:20, marginBottom:8 }}>Exportar a Excel</div>
            <div style={{ color:"#64748b", fontSize:14, marginBottom:24, lineHeight:1.8 }}>
              <strong style={{ color:"#3b82f6" }}>{offers.length} ofertas</strong> · Columnas incluidas:<br/>
              Nro · Entidad · Objeto del Contrato · Código · <span style={{ color:"#22c55e" }}>Monto Ref.</span> · <span style={{ color:"#3b82f6" }}>Monto Ofertado</span> · Fechas · <span style={{ color:"#eab308" }}>Estado Subida</span> · <span style={{ color:"#22c55e" }}>Resultado</span>
            </div>
            <button onClick={exportToCSV} style={{ background:"linear-gradient(135deg,#22c55e,#16a34a)", border:"none", borderRadius:12, padding:"14px 32px", color:"#fff", fontWeight:700, fontSize:16, cursor:"pointer", boxShadow:"0 4px 16px #22c55e44" }}>⬇️ Descargar CSV para Excel</button>
            <div style={{ color:"#475569", fontSize:12, marginTop:16 }}>Excel → Datos → Desde texto/CSV</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        button:hover{filter:brightness(1.12);}
        input:focus{border-color:#3b82f6!important;box-shadow:0 0 0 2px #3b82f622;}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0f172a}::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
      `}</style>
    </div>
  );
}
