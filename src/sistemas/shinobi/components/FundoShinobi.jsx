// Fundo das telas iniciais (Login e Lobby): céu de entardecer, montanhas e telhados em silhueta.
// Tudo em CSS/SVG, sem imagem e sem animação em loop (leve no celular).

function Shuriken({ className = '' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50 4 L58 42 L96 50 L58 58 L50 96 L42 58 L4 50 L42 42 Z" fill="currentColor" />
      <circle cx="50" cy="50" r="7" fill="#120e0b" />
    </svg>
  );
}

export default function FundoShinobi({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Céu: laranja no horizonte, tinta escura no alto */}
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 90% 55% at 50% 100%, rgba(236,106,15,0.38), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 10%, rgba(255,165,85,0.08), transparent 70%), linear-gradient(180deg, #0d0a08 0%, #1b1612 55%, #2a1608 100%)' }} />
      {/* Sol poente */}
      <div className="pointer-events-none absolute bottom-[18%] left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-60 blur-[2px]"
        style={{ background: 'radial-gradient(circle, #ffb36b 0%, #ec6a0f 45%, rgba(236,106,15,0) 70%)' }} />
      {/* Montanhas e telhados */}
      <svg className="pointer-events-none absolute bottom-0 left-0 h-[42%] w-full" viewBox="0 0 1440 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 260 L160 150 L280 230 L430 110 L560 220 L700 140 L860 240 L1010 120 L1160 230 L1300 160 L1440 230 L1440 400 L0 400 Z" fill="#1e140d" />
        <path d="M0 310 L120 250 L260 300 L400 230 L540 300 L720 240 L900 310 L1060 250 L1220 300 L1440 260 L1440 400 L0 400 Z" fill="#160f0a" />
        {/* telhados */}
        <path d="M60 400 V330 L40 330 L110 300 L180 330 L160 330 V400 Z M260 400 V345 L240 345 L300 318 L360 345 L340 345 V400 Z M1080 400 V320 L1055 320 L1135 285 L1215 320 L1190 320 V400 Z M1260 400 V340 L1240 340 L1300 312 L1360 340 L1340 340 V400 Z" fill="#0f0a07" />
        <rect x="0" y="372" width="1440" height="28" fill="#0f0a07" />
      </svg>
      {/* Shurikens decorativos */}
      <Shuriken className="pointer-events-none absolute -left-10 top-24 h-40 w-40 rotate-12 text-red-600/10" />
      <Shuriken className="pointer-events-none absolute -right-8 top-1/3 h-28 w-28 -rotate-12 text-red-500/10" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export { Shuriken };
