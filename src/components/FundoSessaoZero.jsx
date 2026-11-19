// Fundo das telas da marca Sessão Zero (login e escolha do sistema):
// um mapa de batalha de vinil quadriculado. Só CSS, sem imagem e sem animação (leve no celular).
export default function FundoSessaoZero({ children }) {
  return <div className="sz-mapa min-h-screen">{children}</div>;
}

/** Trajeto de movimento desenhado a pincel atômico entre dois tokens (decoração). */
export function TrajetoMarcador({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 420 150" aria-hidden="true">
      <path d="M44 112 C 120 124, 150 44, 250 52 S 350 88, 372 50" fill="none" stroke="#3fa66b" strokeWidth="4"
        strokeDasharray="10 9" strokeLinecap="round" />
      <circle cx="30" cy="112" r="17" fill="#1d242b" stroke="#3b82c4" strokeWidth="3.5" />
      <circle cx="390" cy="40" r="17" fill="#1d242b" stroke="#e5484d" strokeWidth="3.5" />
      <text x="390" y="47" textAnchor="middle" fontFamily="'Permanent Marker', cursive" fontSize="20" fill="#e5484d">!</text>
    </svg>
  );
}
