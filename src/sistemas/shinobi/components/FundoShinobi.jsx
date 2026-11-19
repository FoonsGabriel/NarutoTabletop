// Fundo das telas do Shinobi (lobby): tinta sumi com um brilho vermelho de selo e um traço de pincel (ensō).
// Tudo em CSS/SVG, sem imagem e sem animação em loop (leve no celular).

export default function FundoShinobi({ children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 88% 0%, rgba(184,50,31,0.20), transparent 60%), radial-gradient(ellipse 60% 60% at 0% 100%, rgba(201,162,75,0.08), transparent 60%)' }} />
      {/* Ensō: círculo de pincel, quase apagado, no canto */}
      <svg className="pointer-events-none absolute -bottom-24 -right-20 h-[26rem] w-[26rem] text-zinc-800/60" viewBox="0 0 200 200" aria-hidden="true">
        <path d="M150 52 C 128 28, 74 26, 46 58 C 20 88, 30 146, 76 166 C 120 184, 170 156, 174 110 C 176 92, 170 80, 162 70"
          fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
      </svg>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Mantido por compatibilidade (antes era o ícone do lobby). */
export function Shuriken({ className = '' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50 4 L58 42 L96 50 L58 58 L50 96 L42 58 L4 50 L42 42 Z" fill="currentColor" />
      <circle cx="50" cy="50" r="7" fill="#16130f" />
    </svg>
  );
}
