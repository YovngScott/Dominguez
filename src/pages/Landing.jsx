import { useState } from "react";
import Icon from "../components/Icon";

const ROJO = "#e10600";
const TEL = "809-575-7986";
const TEL2 = "809-330-3554";

const ASEGURADORAS = [
  "Seguros Banreservas",
  "La Colonial",
  "Seguros Sura",
  "Internacional de Seguros",
  "Atlántica Seguros",
  "CoopSeguros",
];

const SERVICIOS = [
  { icon: "spray", titulo: "Pintura al Horno", desc: "Acabado de fábrica con cabinas especializadas. Máxima durabilidad y brillo profesional." },
  { icon: "hammer", titulo: "Desabolladura", desc: "Restauración precisa de la carrocería sin comprometer la pintura original." },
  { icon: "align", titulo: "Enderezado de Chasis", desc: "Máquinas especializadas para alineación perfecta y corrección estructural." },
  { icon: "cog", titulo: "Reemplazo de Piezas", desc: "Instalación de repuestos originales y alternativos de alta calidad." },
  { icon: "sparkles", titulo: "Detailing y Brillo", desc: "Pulido profesional y cuidado exterior para renovar tu vehículo." },
];

const FAQ = [
  {
    q: "¿Qué es el Deducible?",
    a: "Es la parte del costo de la reparación que te corresponde pagar a ti según tu póliza; el resto lo cubre la aseguradora. El monto exacto depende de tu contrato.",
  },
  {
    q: "¿Qué cubre mi seguro?",
    a: "Depende de tu póliza, pero en general cubre daños por colisión, vuelco y en muchos casos eventos como incendio o robo. Nosotros trabajamos directo con tu aseguradora para gestionar la cobertura.",
  },
  {
    q: "¿Cómo funciona el proceso con mi seguro?",
    a: "Inicias tu expediente con nosotros, coordinamos la inspección con tu aseguradora, cotizamos la reparación y, una vez aprobada, realizamos el trabajo y te mantenemos informado hasta la entrega.",
  },
];

const TESTIMONIOS = [
  {
    nombre: "Rosmery Arias Peña",
    rol: "Guía local · Google Maps",
    texto:
      "Es un taller de pintura de primera, situado en la Avenida Hatuey. Las atenciones excelentes de todo su personal, especialmente su propietario René Domínguez. Estoy satisfecha por el trabajo realizado a mi vehículo. Cuando necesites un buen trabajo de desabolladura y pintura, visita Domínguez Auto Pintura. No te arrepentirás.",
  },
  {
    nombre: "León CSR",
    rol: "Guía local · Google Maps",
    texto: "Excelencia en su trabajo y puntualidad.",
  },
  {
    nombre: "MercaSID",
    rol: "Cliente corporativo",
    texto:
      "El resultado de los indicadores de desempeño para su gestión como nuestro proveedor cumplió con nuestros objetivos, obteniendo un resultado de SATISFACTORIO, con un cumplimiento mayor o igual al 80% de los pedidos entregados a tiempo y completos.",
  },
];

function Avatar({ nombre }) {
  return (
    <span
      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-extrabold text-white"
      style={{ backgroundColor: ROJO }}
    >
      {nombre.charAt(0)}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#ffffff] text-[#0f172a]">
      <Nav />
      <Hero />
      <Aseguradoras />
      <Servicios />
      <Faq />
      <Galeria />
      <Testimonios />
      <Formulario />
      <Footer />
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    ["#inicio", "Inicio"],
    ["#servicios", "Servicios"],
    ["#aseguradoras", "Aseguradoras"],
    ["#galeria", "Galería"],
    ["#faq", "FAQ"],
  ];
  return (
    <header className="sticky top-0 z-40 bg-[#0b0b0c] text-white">
      <div className="h-1" style={{ backgroundColor: ROJO }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <a href="#inicio" className="font-extrabold text-lg tracking-tight">
          Dominguez <span style={{ color: ROJO }}>Auto Pintura</span>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
          {links.map(([href, txt]) => (
            <a key={href} href={href} className="hover:text-white">
              {txt}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href={`tel:${TEL}`} className="hidden sm:inline text-sm font-semibold text-white/90">
            {TEL}
          </a>
          <a
            href="#expediente"
            className="text-sm font-bold px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: ROJO }}
          >
            Iniciar Expediente
          </a>
          <button className="md:hidden text-white" onClick={() => setOpen((v) => !v)} aria-label="Menú">
            <Icon name={open ? "close" : "menu"} className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-white/10 px-4 py-3 flex flex-col gap-2 text-sm text-white/80">
          {links.map(([href, txt]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="py-1.5 hover:text-white">
              {txt}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden bg-[#0b0b0c] text-white">
      <div
        className="absolute -right-24 -top-24 w-96 h-96 rounded-full blur-3xl opacity-30"
        style={{ backgroundColor: ROJO }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <span
          className="inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-5"
          style={{ backgroundColor: "rgba(225,6,0,0.15)", color: "#ff7a77" }}
        >
          Latonería y pintura profesional
        </span>
        <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight max-w-3xl mx-auto">
          Especialistas en latonería y pintura con tu aseguradora de confianza
        </h1>
        <p className="mt-5 text-white/60 italic max-w-2xl mx-auto">
          “Nadie aprende más que el que empieza desde abajo”
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#expediente"
            className="px-6 py-3 rounded-xl font-bold text-white shadow-lg"
            style={{ backgroundColor: ROJO }}
          >
            Iniciar Expediente
          </a>
          <a
            href={`https://wa.me/1${TEL.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 rounded-xl font-bold border border-white/25 text-white hover:bg-white/10"
          >
            Contacta ahora
          </a>
        </div>
      </div>
    </section>
  );
}

function Aseguradoras() {
  return (
    <section id="aseguradoras" className="bg-[#f8fafc] border-y border-[#e6e7eb]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-[#64748b] mb-2">
          Tu tranquilidad es nuestra prioridad
        </p>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold mb-3">Aseguradoras aliadas</h2>
        <p className="text-center text-[#64748b] max-w-2xl mx-auto mb-9">
          Trabajamos directamente con las principales aseguradoras del país para facilitar tu proceso de reclamo.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ASEGURADORAS.map((a) => (
            <div
              key={a}
              className="bg-white border border-[#e6e7eb] rounded-2xl p-5 flex items-center gap-3 shadow-sm"
            >
              <Avatar nombre={a} />
              <div className="min-w-0">
                <p className="font-bold truncate">{a}</p>
                <p className="text-xs text-[#64748b]">Socio confiable en tus reparaciones</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Servicios() {
  return (
    <section id="servicios" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="text-center text-2xl sm:text-3xl font-extrabold">Servicios y especialidades</h2>
      <p className="text-center text-[#64748b] max-w-2xl mx-auto mt-3 mb-10">
        Contamos con cabinas de pintura al horno y máquinas de enderezado de chasis, tecnología de punta que nos diferencia.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {SERVICIOS.map((s) => (
          <div key={s.titulo} className="bg-white border border-[#e6e7eb] rounded-2xl p-6 shadow-sm">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: "rgba(225,6,0,0.08)", color: ROJO }}
            >
              <Icon name={s.icon} className="w-6 h-6" strokeWidth={1.8} />
            </div>
            <h3 className="font-bold text-lg">{s.titulo}</h3>
            <p className="text-[#64748b] text-sm mt-1.5">{s.desc}</p>
          </div>
        ))}
        <a
          href="#expediente"
          className="rounded-2xl p-6 text-white flex flex-col justify-center shadow-lg"
          style={{ backgroundColor: ROJO }}
        >
          <h3 className="font-extrabold text-xl">¿Necesitas cotizar?</h3>
          <p className="text-white/85 text-sm mt-1.5">Inicia tu expediente y te respondemos en menos de 24 horas.</p>
          <span className="mt-4 inline-flex items-center gap-1.5 font-bold">Cotizar reparación →</span>
        </a>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="bg-[#f8fafc] border-y border-[#e6e7eb]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold">Preguntas frecuentes sobre seguros</h2>
        <p className="text-center text-[#64748b] mt-3 mb-9">
          Te ayudamos a entender mejor tu póliza y el proceso de reclamo.
        </p>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="bg-white border border-[#e6e7eb] rounded-xl p-4 group">
              <summary className="font-bold cursor-pointer list-none flex items-center justify-between">
                {f.q}
                <span className="text-[#94a3b8] group-open:rotate-45 transition-transform text-xl leading-none">+</span>
              </summary>
              <p className="text-[#64748b] text-sm mt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Galeria() {
  return (
    <section id="galeria" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="text-center text-2xl sm:text-3xl font-extrabold">Resultados reales</h2>
      <p className="text-center text-[#64748b] max-w-2xl mx-auto mt-3 mb-10">
        Comprueba la calidad de nuestro trabajo con estas transformaciones.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {["Hyundai", "Isuzu", "Kia", "Toyota", "Honda", "Nissan"].map((m, i) => (
          <div
            key={m}
            className="aspect-[4/3] rounded-2xl border border-[#e6e7eb] flex items-center justify-center bg-[#f1f5f9] text-[#94a3b8] font-semibold relative overflow-hidden"
          >
            <span className="text-sm">{m}</span>
            {i === 0 && (
              <span className="absolute bottom-2 left-2 text-[10px] text-[#94a3b8]">
                Próximamente: fotos del taller
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Testimonios() {
  return (
    <section className="bg-[#0b0b0c] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold">Lo que dicen nuestros clientes</h2>
        <p className="text-center text-white/60 mt-3 mb-10">
          La satisfacción de nuestros clientes es nuestra mejor carta de presentación.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {TESTIMONIOS.map((t) => (
            <div key={t.nombre} className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Avatar nombre={t.nombre} />
                <div>
                  <p className="font-bold">{t.nombre}</p>
                  <p className="text-xs text-white/50">{t.rol}</p>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed">“{t.texto}”</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Campo({ label, children, req }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#334155]">
        {label} {req && <span style={{ color: ROJO }}>*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#cbd5e1] px-3.5 py-2.5 text-[#0f172a] outline-none focus:border-[#e10600] focus:ring-2 focus:ring-[#e10600]/20";

function Formulario() {
  const [paso, setPaso] = useState(1);
  const [f, setF] = useState({
    nombre: "",
    telefono: "",
    email: "",
    marca: "",
    modelo: "",
    anio: "",
    aseguradora: "",
    reclamo: "",
    fecha: "",
    mensaje: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function siguiente() {
    setError("");
    if (!f.nombre.trim() || !f.telefono.trim()) {
      setError("El nombre y el teléfono son obligatorios.");
      return;
    }
    setPaso(2);
  }

  async function enviar() {
    setError("");
    setEnviando(true);
    try {
      const r = await fetch("/api/agendar-cita", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.success) throw new Error(data.error || "No se pudo enviar la solicitud.");
      setOk(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section id="expediente" className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h2 className="text-center text-2xl sm:text-3xl font-extrabold">Inicia tu reclamo o reparación hoy</h2>
      <p className="text-center text-[#64748b] mt-3 mb-8">
        Completa el formulario y nos pondremos en contacto contigo en menos de 24 horas.
      </p>

      <div className="bg-white border border-[#e6e7eb] rounded-2xl shadow-sm p-6 sm:p-8">
        {ok ? (
          <div className="text-center py-8">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4"
              style={{ backgroundColor: "rgba(5,150,105,0.12)" }}
            >
              <Icon name="check" className="w-9 h-9 text-emerald-600" />
            </div>
            <h3 className="text-xl font-extrabold">¡Solicitud recibida!</h3>
            <p className="text-[#64748b] mt-2">
              Gracias, {f.nombre.split(" ")[0]}. Tu cita queda <b>pendiente</b> hasta que uno de nuestros agentes
              la confirme por WhatsApp. Te escribiremos en breve{f.email ? " y te enviamos un correo con los datos" : ""}.
            </p>
          </div>
        ) : (
          <>
            {/* Pasos */}
            <div className="flex items-center justify-center gap-4 mb-7 text-sm">
              <Paso n={1} activo={paso === 1} hecho={paso > 1} label="Contacto" />
              <span className="w-8 h-px bg-[#e2e8f0]" />
              <Paso n={2} activo={paso === 2} hecho={false} label="Vehículo" />
            </div>

            {paso === 1 ? (
              <div className="space-y-4">
                <Campo label="Nombre completo" req>
                  <input className={inputCls} value={f.nombre} onChange={(e) => up("nombre", e.target.value)} placeholder="Tu nombre completo" />
                </Campo>
                <Campo label="Teléfono" req>
                  <input className={inputCls} value={f.telefono} onChange={(e) => up("telefono", e.target.value)} placeholder="809-000-0000" />
                </Campo>
                <Campo label="Correo electrónico">
                  <input className={inputCls} value={f.email} onChange={(e) => up("email", e.target.value)} placeholder="tu@email.com" />
                </Campo>
                <button
                  onClick={siguiente}
                  className="w-full py-3 rounded-xl font-bold text-white"
                  style={{ backgroundColor: ROJO }}
                >
                  Siguiente
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Campo label="Marca">
                    <input className={inputCls} value={f.marca} onChange={(e) => up("marca", e.target.value)} placeholder="Toyota, Honda…" />
                  </Campo>
                  <Campo label="Modelo">
                    <input className={inputCls} value={f.modelo} onChange={(e) => up("modelo", e.target.value)} placeholder="Corolla, Civic…" />
                  </Campo>
                  <Campo label="Año">
                    <input className={inputCls} value={f.anio} onChange={(e) => up("anio", e.target.value)} placeholder="2020" />
                  </Campo>
                  <Campo label="Aseguradora">
                    <select className={inputCls} value={f.aseguradora} onChange={(e) => up("aseguradora", e.target.value)}>
                      <option value="">Seleccionar…</option>
                      {ASEGURADORAS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                      <option value="Otra">Otra</option>
                    </select>
                  </Campo>
                  <Campo label="No. de reclamo (si tienes)">
                    <input className={inputCls} value={f.reclamo} onChange={(e) => up("reclamo", e.target.value)} />
                  </Campo>
                  <Campo label="Fecha preferida">
                    <input type="date" className={inputCls} value={f.fecha} onChange={(e) => up("fecha", e.target.value)} />
                  </Campo>
                </div>
                <Campo label="Mensaje / detalles del daño">
                  <textarea rows={3} className={inputCls} value={f.mensaje} onChange={(e) => up("mensaje", e.target.value)} placeholder="Cuéntanos brevemente qué le pasó al vehículo…" />
                </Campo>

                {error && <p className="text-sm" style={{ color: ROJO }}>{error}</p>}

                <div className="flex gap-3">
                  <button onClick={() => setPaso(1)} className="px-5 py-3 rounded-xl font-bold border border-[#cbd5e1] text-[#334155]">
                    Atrás
                  </button>
                  <button
                    onClick={enviar}
                    disabled={enviando}
                    className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-60"
                    style={{ backgroundColor: ROJO }}
                  >
                    {enviando ? "Enviando…" : "Enviar solicitud"}
                  </button>
                </div>
              </div>
            )}
            {error && paso === 1 && <p className="text-sm mt-3" style={{ color: ROJO }}>{error}</p>}
            <p className="text-xs text-[#94a3b8] text-center mt-4">
              Recibirás una confirmación de tu solicitud inmediatamente.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Paso({ n, activo, hecho, label }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: activo || hecho ? ROJO : "#cbd5e1" }}
      >
        {hecho ? "✓" : n}
      </span>
      <span className={`font-semibold ${activo ? "text-[#0f172a]" : "text-[#94a3b8]"}`}>{label}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0b0b0c] text-white/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-3 gap-8">
        <div>
          <p className="font-extrabold text-white text-lg">
            Dominguez <span style={{ color: ROJO }}>Auto Pintura</span>
          </p>
          <p className="text-sm mt-3">Av. Hatuey #16, Santiago, República Dominicana</p>
          <p className="text-sm mt-1">
            <a href={`tel:${TEL}`} className="hover:text-white">{TEL}</a> /{" "}
            <a href={`tel:${TEL2}`} className="hover:text-white">{TEL2}</a>
          </p>
        </div>
        <div>
          <p className="font-bold text-white mb-3">Horario de atención</p>
          <p className="text-sm">Lunes a viernes: 8:00 AM – 6:00 PM</p>
          <p className="text-sm">Sábados: 8:00 AM – 1:00 PM</p>
          <p className="text-sm">Domingos: cerrado</p>
        </div>
        <div>
          <p className="font-bold text-white mb-3">Enlaces rápidos</p>
          <ul className="text-sm space-y-1.5">
            <li><a href="#inicio" className="hover:text-white">Inicio</a></li>
            <li><a href="#servicios" className="hover:text-white">Servicios</a></li>
            <li><a href="#aseguradoras" className="hover:text-white">Aseguradoras</a></li>
            <li><a href="#faq" className="hover:text-white">Preguntas frecuentes</a></li>
            <li><a href="#expediente" className="hover:text-white">Iniciar expediente</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Dominguez Auto Pintura. Todos los derechos reservados.
      </div>
    </footer>
  );
}
