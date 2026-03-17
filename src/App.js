import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const SENSORIAL = ["Doçura", "Acidez", "Amargor", "Corpo", "Floral/Herbal"];
const METODOS = ["Hario V60", "Origami"];
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_KEY;

function cx(...a) { return a.filter(Boolean).join(" "); }

function parseJSON(txt) {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Resposta invalida");
  return JSON.parse(m[0]);
}

async function callAI(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(b => b.text || "").join("");
}

async function analyzeBean(b64, mime) {
  const txt = await callAI([{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: "Leia com atencao todos os textos visiveis nesta embalagem de cafe especial brasileiro. Extraia: nome do blend/cafe (ex: Nutella, Mel Imperial - geralmente em destaque ou na lateral), marca/torrefacao (ex: King Coffee Co.), origem/regiao (ex: Carmo de Minas MG, Cerrado Mineiro), processo (Natural, Lavado, Honey), torra (Clara, Media, Escura - baseado na data de torra se visivel), notas de sabor (sabor, acidez, corpo, finalizacao). Retorne SOMENTE JSON sem markdown: {\"nome\":\"\",\"marca\":\"\",\"origem\":\"\",\"processo\":\"\",\"torra\":\"\",\"notas\":\"\",\"perfil\":[]}. perfil = array com itens relevantes de [\"Docura\",\"Acidez\",\"Amargor\",\"Corpo\",\"Floral/Herbal\"]." }
    ]
  }]);
  const p = parseJSON(txt);
  return { nome: p.nome||"", marca: p.marca||"", origem: p.origem||"", processo: p.processo||"", torra: p.torra||"", notas: p.notas||"", perfil: Array.isArray(p.perfil)?p.perfil:[] };
}

async function genRecipe(bean, tipo, sens, eq) {
  const info = bean.nome+(bean.marca?" ("+bean.marca+")":"")+(bean.origem?", "+bean.origem:"")+(bean.processo?", "+bean.processo:"")+(bean.torra?", torra "+bean.torra:"")+(bean.notas?". Notas: "+bean.notas:"");
  const txt = await callAI([{ role: "user", content:
    "Cafe: "+info+". Bebida: "+tipo+". Perfil: "+sens.join(", ")+". Equipamento: "+eq+"."+
    " Voce e barista especialista James Hoffmann."+
    " Retorne SOMENTE JSON: {\"resumo\":\"\",\"parametros\":[{\"label\":\"\",\"valor\":\"\"}],\"yieldSugerido\":{\"ativo\":false,\"motivo\":\"\",\"de\":\"\",\"para\":\"\",\"impacto\":\"\"},\"dicas\":[\"\"],\"expectativa\":\"\"}."+
    " Use: dose, yield em ml, ratio, brew ratio, bloom, puck, shot, graus C. Numeros exatos."+
    " Nao inclua pressao nos parametros."+
    " Para temperatura: se for 93C diga que e o padrao da Breville Barista Express e nao precisa ajustar. Se for diferente, explique como ajustar: segure o botao de 1 xicara por 3 segundos ate os LEDs piscarem, depois pressione vapor para subir ou 1 xicara para descer."+
    " Para moagem externa sugira APENAS um numero inteiro."+
    " Se brew ratio nao informado, sugira o ideal e ative yieldSugerido."
  }]);
  return parseJSON(txt);
}

async function genImprove(beanNome, recipe, feedback) {
  const txt = await callAI([{ role: "user", content:
    "Cafe: "+beanNome+". Receita anterior: "+JSON.stringify(recipe)+". Feedback: "+feedback+"."+
    " Voce e barista especialista James Hoffmann."+
    " Retorne SOMENTE JSON: {\"analise\":\"\",\"ajustes\":[{\"label\":\"\",\"de\":\"\",\"para\":\"\"}],\"novaDica\":\"\"}"
  }]);
  return parseJSON(txt);
}

const Spin = ({text}) => (
  <div className="flex flex-col items-center gap-3 py-10">
    <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-800 rounded-full animate-spin"/>
    <p className="text-amber-700 text-sm">{text}</p>
  </div>
);
const Chip = ({label,sel,onClick}) => (
  <button onClick={onClick} className={cx("rounded-full px-3 py-1 text-sm border transition-all", sel?"bg-amber-800 text-white border-amber-800":"border-amber-300 text-amber-800 hover:bg-amber-50")}>{label}</button>
);
const Bar = ({step,total}) => (
  <div className="flex gap-1 mb-5">{Array.from({length:total},(_,i)=><div key={i} className={cx("h-1 flex-1 rounded",i<step?"bg-amber-800":"bg-amber-200")}/>)}</div>
);
const ErrBox = ({msg}) => msg?<div className="my-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{msg}</div>:null;
const Field = ({label,sub,ph,val,onChange}) => (
  <div>
    <label className="text-xs font-medium text-amber-600">{label}</label>
    {sub&&<p className="text-xs text-amber-400">{sub}</p>}
    <input value={val} onChange={onChange} placeholder={ph} className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-amber-400"/>
  </div>
);
const Box = ({children,className,onClick}) => <div onClick={onClick} className={cx("bg-white rounded-2xl shadow-md p-5",className)}>{children}</div>;
const PBtn = ({onClick,children,disabled}) => (
  <button onClick={onClick} disabled={disabled} className="w-full rounded-xl bg-amber-800 text-white px-4 py-3 font-medium text-sm hover:bg-amber-700 disabled:opacity-40 transition-all">{children}</button>
);

const emptyBean = () => ({nome:"",marca:"",origem:"",processo:"",torra:"",notas:""});

export default function App() {
  const fileRef = useRef(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [beans, setBeans] = useState([]);
  const [screen, setScreen] = useState("home");
  const [busy, setBusy] = useState(false);
  const [busyTxt, setBusyTxt] = useState("");
  const [err, setErr] = useState("");
  const [step, setStep] = useState(1);
  const [imgSrc, setImgSrc] = useState(null);
  const [imgB64, setImgB64] = useState(null);
  const [imgMime, setImgMime] = useState(null);
  const [photoMode, setPhotoMode] = useState(true);
  const [bean, setBean] = useState(emptyBean());
  const [tipo, setTipo] = useState(null);
  const [sens, setSens] = useState([]);
  const [mInt, setMInt] = useState("");
  const [mExt, setMExt] = useState("");
  const [metodo, setMetodo] = useState("Hario V60");
  const [yld, setYld] = useState("250");
  const [ratio, setRatio] = useState("");
  const [recipe, setRecipe] = useState(null);
  const [improve, setImprove] = useState(null);
  const [fb, setFb] = useState("");
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState("Espresso");
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState("nome");
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({data:{session}}) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_,session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) loadBeans();
  }, [user]);

  const loadBeans = async () => {
    const {data} = await supabase.from("recipes").select("*").order("saved_at", {ascending:false});
    setBeans(data || []);
  };

  const loginGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setScreen("home");
  };

  const reset = () => {
    setStep(1); setBean(emptyBean()); setTipo(null); setSens([]);
    setMInt(""); setMExt(""); setMetodo("Hario V60"); setYld("250"); setRatio("");
    setRecipe(null); setImprove(null); setFb(""); setSaved(false); setErr("");
    setImgSrc(null); setImgB64(null); setImgMime(null); setPhotoMode(true);
  };
  const goHome = () => { reset(); setScreen("home"); };
  const upd = (f,v) => setBean(p=>({...p,[f]:v}));

  const onFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1120; let w=img.width,h=img.height;
        if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}
        const c=document.createElement("canvas"); c.width=w; c.height=h;
        c.getContext("2d").drawImage(img,0,0,w,h);
        const out=c.toDataURL("image/jpeg",0.92);
        setImgSrc(out); setImgB64(out.split(",")[1]); setImgMime("image/jpeg");
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const doAnalyze = async () => {
    setBusy(true); setBusyTxt("Analisando o pacote..."); setErr("");
    try { const info=await analyzeBean(imgB64,imgMime); setBean(info); setStep(2); }
    catch(e) { setErr("Análise automática indisponível. Preencha manualmente."); setPhotoMode(false); setStep(2); }
    finally { setBusy(false); }
  };

  const doRecipe = async () => {
    setBusy(true); setBusyTxt("Gerando receita..."); setErr("");
    try {
      const eq = tipo==="Coado"
        ? metodo+", yield "+(yld||"a definir")+"ml, brew ratio "+(ratio||"sugira o ideal")+", Breville Smart Grinder Pro moedor interno "+mInt+", externo "+(mExt||"sugira o ideal")
        : "Breville Barista Express moedor interno "+mInt+", externo "+(mExt||"sugira o ideal");
      const r=await genRecipe(bean,tipo,sens,eq);
      setRecipe(r); setScreen("recipe");
    } catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const doSave = async () => {
    if (saved) return;
    const {error} = await supabase.from("recipes").insert({
      user_id: user.id,
      nome: bean.nome||"Sem nome",
      marca: bean.marca||"",
      origem: bean.origem||"",
      torra: bean.torra||"",
      tipo_bebida: tipo,
      sensorial: sens,
      recipe
    });
    if (!error) { setSaved(true); await loadBeans(); }
  };

  const doDelete = async (id) => {
    await supabase.from("recipes").delete().eq("id", id);
    await loadBeans();
    setConfirmDelete(null);
  };

  const doImprove = async () => {
    setBusy(true); setBusyTxt("Calculando ajustes...");
    try { const imp=await genImprove(bean.nome,recipe,fb); setImprove(imp); setScreen("improve"); }
    catch(e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (authLoading) return <div className="min-h-screen bg-amber-50 flex items-center justify-center"><Spin text="Carregando..."/></div>;

  if (!user) return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:"72px",fontWeight:"900",color:"#3B2000",lineHeight:"1"}}>coffs</p>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:"14px",fontWeight:"600",color:"#6b3f1a",letterSpacing:"2px"}}>seu guia de extração</p>
      </div>
      <button onClick={loginGoogle} className="flex items-center gap-3 bg-white border border-amber-200 rounded-2xl px-6 py-4 shadow-md hover:shadow-lg transition-all">
        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.2 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.6 26.9 36 24 36c-5.2 0-9.6-2.8-11.3-7l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C41 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
        <span className="font-semibold text-amber-900">Entrar com Google</span>
      </button>
    </div>
  );

  if (screen==="home") return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:"72px",fontWeight:"900",color:"#3B2000",lineHeight:"1"}}>coffs</p>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:"14px",fontWeight:"600",color:"#6b3f1a",letterSpacing:"2px"}}>seu guia de extração</p>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-3">
        <Box onClick={()=>{reset();setScreen("saved");}} className="cursor-pointer hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3"><span className="text-3xl">📦</span><div><p className="font-semibold text-amber-900">Receitas salvas</p><p className="text-xs text-amber-500">Usar receita anterior</p></div></div>
        </Box>
        <Box onClick={()=>{reset();setScreen("flow");}} className="cursor-pointer hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-3"><span className="text-3xl">✨</span><div><p className="font-semibold text-amber-900">Novo grão</p><p className="text-xs text-amber-500">Gerar nova receita com IA</p></div></div>
        </Box>
      </div>
      <button onClick={logout} className="mt-8 text-xs text-amber-400 hover:text-amber-600">Sair ({user.email})</button>
    </div>
  );

  if (screen==="saved") {
    const list = beans
      .filter(b=>filter==="Espresso"?(b.tipo_bebida==="Espresso"||b.tipo_bebida==="Cappuccino"):b.tipo_bebida==="Coado")
      .filter(b=>{ if(!search.trim()) return true; const q=search.toLowerCase(); return searchBy==="nome"?(b.nome||"").toLowerCase().includes(q):(b.marca||"").toLowerCase().includes(q); });
    return (
      <div className="min-h-screen bg-amber-50 p-4 max-w-sm mx-auto">
        <button onClick={goHome} className="text-amber-700 text-sm mb-4">← Voltar</button>
        <h2 className="text-xl font-bold text-amber-900 mb-4">Receitas salvas</h2>
        <div className="flex gap-2 mb-3">
          {["Espresso","Coado"].map(c=>(
            <button key={c} onClick={()=>setFilter(c)} className={cx("flex-1 rounded-xl py-2 text-sm font-medium border transition-all",filter===c?"bg-amber-800 text-white border-amber-800":"border-amber-300 text-amber-700")}>
              {c==="Espresso"?"☕ Espresso/Cappuccino":"💧 Coado"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-2">
          {["nome","marca"].map(opt=>(
            <button key={opt} onClick={()=>{setSearchBy(opt);setSearch("");}} className={cx("flex-1 rounded-xl py-1.5 text-xs font-medium border transition-all",searchBy===opt?"bg-amber-100 border-amber-400 text-amber-800":"border-amber-200 text-amber-500")}>
              Buscar por {opt==="nome"?"nome":"marca"}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchBy==="nome"?"ex: Nutella":"ex: King Coffee Co."} className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-400"/>
        {confirmDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
              <p className="font-bold text-amber-900 text-lg mb-1">Apagar receita?</p>
              <p className="text-sm text-amber-600 mb-6">Esta ação é permanente e não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button onClick={()=>setConfirmDelete(null)} className="flex-1 rounded-xl border border-amber-300 text-amber-700 py-2 text-sm font-medium hover:bg-amber-50">Cancelar</button>
                <button onClick={()=>doDelete(confirmDelete)} className="flex-1 rounded-xl bg-red-500 text-white py-2 text-sm font-medium hover:bg-red-400">Apagar definitivamente</button>
              </div>
            </div>
          </div>
        )}
        {list.length===0
          ? <Box><p className="text-amber-600 text-sm text-center py-2">{beans.length===0?"Nenhuma receita salva ainda.":"Nenhuma receita encontrada."}</p></Box>
          : list.map(b=>(
            <Box key={b.id} className="mb-3 hover:shadow-lg transition-shadow relative"
              onClick={()=>{setSaved(true);setRecipe(b.recipe);setBean({nome:b.nome,marca:b.marca||"",origem:b.origem||"",processo:"",torra:b.torra||"",notas:""});setTipo(b.tipo_bebida);setSens(b.sensorial||[]);setScreen("recipe");}}>
              <button onClick={e=>{e.stopPropagation();setConfirmDelete(b.id);}} className="absolute top-4 right-4 text-amber-300 hover:text-red-400 transition-colors text-lg">🗑</button>
              <p className="font-bold text-amber-900 underline decoration-dotted pr-6">{b.nome}</p>
              {b.marca&&<p className="text-xs font-medium text-amber-600">{b.marca}</p>}
              <p className="text-xs text-amber-500">{[b.origem,b.torra].filter(Boolean).join(" · ")}</p>
              <div className="flex gap-1 mt-1 flex-wrap">
                <span className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">{b.tipo_bebida}</span>
                {b.sensorial?.map(s=><span key={s} className="text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded px-2 py-0.5">{s}</span>)}
              </div>
              <p className="text-xs text-amber-400 mt-1">{new Date(b.saved_at).toLocaleDateString("pt-BR")}</p>
            </Box>
          ))}
      </div>
    );
  }

  if (screen==="flow") return (
    <div className="min-h-screen bg-amber-50 p-4 max-w-sm mx-auto">
      <button onClick={goHome} className="text-amber-700 text-sm mb-4">← Voltar</button>
      <Bar step={step} total={5}/>
      {busy&&<Spin text={busyTxt}/>}

      {!busy&&step===1&&(
        <Box>
          <h2 className="font-bold text-amber-900 mb-1">Qual grão vai usar hoje?</h2>
          <p className="text-xs text-amber-500 mb-4">Envie uma foto do pacote para preenchimento automático</p>
          <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-amber-300 rounded-xl p-6 text-center cursor-pointer hover:bg-amber-50 transition mb-3">
            {imgSrc?<img src={imgSrc} alt="pacote" className="mx-auto max-h-44 rounded-lg object-contain"/>:<><div className="text-4xl mb-2">📸</div><p className="text-amber-600 text-sm">Toque para enviar foto</p></>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile}/>
          {imgB64&&<PBtn onClick={doAnalyze}>Analisar foto →</PBtn>}
          <button onClick={()=>{setPhotoMode(false);setStep(2);}} className="w-full mt-2 text-sm text-amber-500 hover:text-amber-700 py-1">Preencher manualmente</button>
        </Box>
      )}

      {!busy&&step===2&&(
        <Box>
          <h2 className="font-bold text-amber-900 mb-1">{photoMode&&imgB64?"Confirme as informações":"Sobre o grão"}</h2>
          <p className="text-xs text-amber-500 mb-3">{photoMode&&imgB64?"Corrija qualquer campo se necessário":"Preencha as informações do pacote"}</p>
          <ErrBox msg={err}/>
          <div className="flex flex-col gap-3 mb-5">
            <Field label="Nome do café *" ph="ex: Nutella" val={bean.nome} onChange={e=>upd("nome",e.target.value)}/>
            <Field label="Marca / Torrefação" ph="ex: King Coffee Co." val={bean.marca} onChange={e=>upd("marca",e.target.value)}/>
            <Field label="Origem / Região" ph="ex: Cerrado Mineiro, Brasil" val={bean.origem} onChange={e=>upd("origem",e.target.value)}/>
            <Field label="Processo" ph="ex: Natural, Lavado, Honey" val={bean.processo} onChange={e=>upd("processo",e.target.value)}/>
            <Field label="Torra" ph="ex: Clara, Média, Escura" val={bean.torra} onChange={e=>upd("torra",e.target.value)}/>
            <Field label="Notas oficiais" ph="ex: Chocolate, Frutas vermelhas..." val={bean.notas} onChange={e=>upd("notas",e.target.value)}/>
          </div>
          <PBtn onClick={()=>setStep(3)} disabled={!bean.nome}>Confirmar ✓</PBtn>
        </Box>
      )}

      {!busy&&step===3&&(
        <Box>
          <div className="p-3 bg-amber-50 rounded-xl mb-4 flex gap-3">
            <span className="text-2xl">☕</span>
            <div>
              <p className="font-bold text-amber-900">{bean.nome}</p>
              {bean.marca&&<p className="text-xs text-amber-600">{bean.marca}</p>}
              {bean.origem&&<p className="text-xs text-amber-500">{bean.origem}</p>}
              {(bean.processo||bean.torra)&&<p className="text-xs text-amber-500">{[bean.processo,bean.torra].filter(Boolean).join(" · ")}</p>}
              {bean.notas&&<p className="text-xs text-amber-400 italic mt-1">"{bean.notas}"</p>}
            </div>
          </div>
          <h2 className="font-bold text-amber-900 mb-3">Qual tipo de café quer tomar?</h2>
          <div className="flex flex-col gap-2 mb-4">
            {["Espresso","Cappuccino","Coado"].map(t=>(
              <button key={t} onClick={()=>setTipo(t)} className={cx("rounded-xl border px-4 py-3 text-left font-medium transition-all",tipo===t?"bg-amber-800 text-white border-amber-800":"border-amber-300 text-amber-800 hover:bg-amber-50")}>
                {t==="Espresso"?"☕ Espresso":t==="Cappuccino"?"🥛 Cappuccino":"💧 Coado"}
              </button>
            ))}
          </div>
          <PBtn onClick={()=>setStep(4)} disabled={!tipo}>Próximo →</PBtn>
        </Box>
      )}

      {!busy&&step===4&&(
        <Box>
          <h2 className="font-bold text-amber-900 mb-1">Perfil sensorial</h2>
          <p className="text-xs text-amber-500 mb-4">Quais notas quer explorar?</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {SENSORIAL.map(s=><Chip key={s} label={s} sel={sens.includes(s)} onClick={()=>setSens(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s])}/>)}
          </div>
          <PBtn onClick={()=>setStep(5)} disabled={sens.length===0}>Próximo →</PBtn>
        </Box>
      )}

      {!busy&&step===5&&(tipo==="Espresso"||tipo==="Cappuccino")&&(
        <Box>
          <h2 className="font-bold text-amber-900 mb-4">Configuração do moedor</h2>
          <div className="flex flex-col gap-3 mb-4">
            <Field label="Moedor interno (Breville Barista Express)" ph="ex: 3" val={mInt} onChange={e=>setMInt(e.target.value)}/>
            <Field label="Ajuste externo do moedor" ph="Deixe em branco para sugestão" val={mExt} onChange={e=>setMExt(e.target.value)}/>
          </div>
          <ErrBox msg={err}/>
          <PBtn onClick={doRecipe}>Gerar receita ✨</PBtn>
        </Box>
      )}

      {!busy&&step===5&&tipo==="Coado"&&(
        <Box>
          <h2 className="font-bold text-amber-900 mb-4">Configuração do coado</h2>
          <div className="flex flex-col gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-amber-600">Método</label>
              <div className="flex gap-2 mt-1">{METODOS.map(m=><Chip key={m} label={m} sel={metodo===m} onClick={()=>setMetodo(m)}/>)}</div>
            </div>
            <Field label="Yield (volume final na xícara)" ph="ex: 250ml" val={yld} onChange={e=>setYld(e.target.value)}/>
            <div>
              <label className="text-xs font-medium text-amber-600">Brew ratio (café:água)</label>
              <div className="flex gap-2 mt-1 flex-wrap">{["1:14","1:15","1:16","1:17"].map(r=><Chip key={r} label={r} sel={ratio===r} onClick={()=>setRatio(r)}/>)}</div>
              <input value={ratio} onChange={e=>setRatio(e.target.value)} placeholder="Deixe em branco para sugestão" className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-amber-400"/>
            </div>
            <Field label="Moedor interno (Breville Smart Grinder Pro)" ph="ex: 6" val={mInt} onChange={e=>setMInt(e.target.value)}/>
            <Field label="Ajuste externo do moedor" ph="Deixe em branco para sugestão de ajuste" val={mExt} onChange={e=>setMExt(e.target.value)}/>
          </div>
          <ErrBox msg={err}/>
          <PBtn onClick={doRecipe}>Gerar receita ✨</PBtn>
        </Box>
      )}
    </div>
  );

  if (screen==="recipe"&&recipe) return (
    <div className="min-h-screen bg-amber-50 p-4 max-w-sm mx-auto pb-10">
      <button onClick={goHome} className="text-amber-700 text-sm mb-4">← Início</button>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">☕</span>
        <div>
          <h2 className="font-bold text-amber-900">{bean.nome}</h2>
          {bean.marca&&<p className="text-xs text-amber-600">{bean.marca}</p>}
          <p className="text-xs text-amber-500">{tipo} · {sens.join(", ")}</p>
        </div>
      </div>
      <Box>
        <p className="text-sm text-amber-700 italic mb-4">{recipe.resumo}</p>
        <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-2">Parâmetros</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {recipe.parametros?.map((p,i)=>(
            <div key={i} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <p className="text-xs text-amber-500">{p.label}</p>
              <p className="font-bold text-amber-900 text-sm">{p.valor}</p>
            </div>
          ))}
        </div>
        {recipe.dicas?.length>0&&<>
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-2">Dicas</p>
          <ul className="flex flex-col gap-1 mb-4">{recipe.dicas.map((d,i)=><li key={i} className="text-sm text-amber-700 flex gap-2"><span>•</span>{d}</li>)}</ul>
        </>}
        {recipe.expectativa&&<>
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-1">O que esperar</p>
          <p className="text-sm text-amber-600 italic mb-2">{recipe.expectativa}</p>
        </>}
        {recipe.yieldSugerido?.ativo&&(
          <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">💡 Sugestão de yield</p>
            <p className="text-sm text-blue-800 mb-2">{recipe.yieldSugerido.motivo}</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm line-through text-blue-400">{recipe.yieldSugerido.de}</span>
              <span className="text-blue-400">→</span>
              <span className="text-sm font-bold text-blue-800">{recipe.yieldSugerido.para}</span>
            </div>
            <p className="text-xs text-blue-600 italic">{recipe.yieldSugerido.impacto}</p>
          </div>
        )}
      </Box>
      {!saved&&<button onClick={doSave} className="w-full mt-3 rounded-xl border border-amber-800 text-amber-800 px-4 py-2 text-sm font-medium hover:bg-amber-50 transition-all">💾 Salvar receita</button>}
      {saved&&<p className="text-center text-xs text-emerald-600 mt-3">✓ Receita salva</p>}
      {busy&&<Spin text={busyTxt}/>}
      {!busy&&(
        <Box className="mt-4">
          <h3 className="font-bold text-amber-900 mb-3">Como ficou?</h3>
          <textarea value={fb} onChange={e=>setFb(e.target.value)} rows={3} placeholder="Descreva o resultado..." className="w-full border border-amber-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"/>
          <ErrBox msg={err}/>
          <div className="flex gap-2">
            <button onClick={async()=>{await doSave();goHome();}} className="flex-1 rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-500">👍 Ficou bom!</button>
            <button onClick={doImprove} disabled={!fb} className="flex-1 rounded-xl bg-red-500 text-white px-4 py-2 text-sm font-medium hover:bg-red-400 disabled:opacity-40">👎 Melhorar</button>
          </div>
          {!fb&&<p className="text-xs text-amber-400 mt-2 text-center">Escreva o que sentiu para receber ajuste</p>}
        </Box>
      )}
    </div>
  );

  if (screen==="improve"&&improve) return (
    <div className="min-h-screen bg-amber-50 p-4 max-w-sm mx-auto pb-10">
      <button onClick={()=>setScreen("recipe")} className="text-amber-700 text-sm mb-4">← Receita</button>
      <h2 className="text-xl font-bold text-amber-900 mb-1">Ajustes para a próxima</h2>
      <p className="text-xs text-amber-500 mb-4">Baseados no seu feedback</p>
      {improve.analise&&<Box className="mb-3 bg-amber-100 border border-amber-200"><p className="text-sm text-amber-800">🔍 {improve.analise}</p></Box>}
      {improve.ajustes?.length>0&&(
        <Box className="mb-3">
          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide mb-3">O que mudar</p>
          {improve.ajustes.map((a,i)=>(
            <div key={i} className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-medium text-amber-600 w-20 shrink-0">{a.label}</span>
              <span className="text-sm line-through text-amber-400">{a.de}</span>
              <span className="text-amber-400">→</span>
              <span className="text-sm font-bold text-amber-900">{a.para}</span>
            </div>
          ))}
        </Box>
      )}
      {improve.novaDica&&<Box className="mb-4 bg-emerald-50 border border-emerald-200"><p className="text-sm text-emerald-800">💡 {improve.novaDica}</p></Box>}
      <PBtn onClick={goHome}>← Voltar ao início</PBtn>
    </div>
  );

  return null;
}
