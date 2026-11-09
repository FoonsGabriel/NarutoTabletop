import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Tempos da animação (ms)
const SHUFFLE_EVERY = 70;   // troca do número enquanto o dado gira
const FIRST_STOP = 650;     // quando o 1º dado para
const STAGGER = 180;        // atraso entre um dado e o próximo
const SHOW_RESULT = 2400;   // quanto tempo o resultado fica na tela

/**
 * Animação de rolagem: mostra CADA dado rolado, depois o modificador e o total.
 * Fica num card flutuante acima de tudo (inclusive da ficha completa) e não
 * bloqueia o tabuleiro. Clique no card para fechar antes.
 *
 * rollData: { formula, sides, rolls?: number[], finalResult, playerName, label? }
 */
export default function DiceRollerAnimation({ rollData, onFinish }) {
  // Guarda o onFinish numa ref: assim a animação não reinicia quando a sala re-renderiza.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const sides = Number(rollData?.sides || 8);
  const rolls = useMemo(() => (Array.isArray(rollData?.rolls) ? rollData.rolls : []), [rollData]);
  const total = Number(rollData?.finalResult ?? 0);
  const modifier = rolls.length ? total - rolls.reduce((sum, value) => sum + value, 0) : 0;

  const [faces, setFaces] = useState([]);
  const [stopped, setStopped] = useState([]);
  const [showTotal, setShowTotal] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!rollData) return undefined;

    const count = Math.max(rolls.length, 1);
    setFaces(Array.from({ length: count }, () => randomFace(sides)));
    setStopped(Array(count).fill(false));
    setShowTotal(false);
    setLeaving(false);

    const timers = [];

    const shuffle = setInterval(() => {
      setFaces((current) => current.map(() => randomFace(sides)));
    }, SHUFFLE_EVERY);

    // Cada dado para no seu valor real, um depois do outro.
    for (let index = 0; index < count; index += 1) {
      timers.push(setTimeout(() => {
        setStopped((current) => current.map((value, i) => (i === index ? true : value)));
        if (index === count - 1) {
          clearInterval(shuffle);
          setShowTotal(true);
        }
      }, FIRST_STOP + index * STAGGER));
    }

    const end = FIRST_STOP + (count - 1) * STAGGER + SHOW_RESULT;
    timers.push(setTimeout(() => setLeaving(true), end));
    timers.push(setTimeout(() => onFinishRef.current?.(), end + 300));

    return () => {
      clearInterval(shuffle);
      timers.forEach(clearTimeout);
    };
  }, [rollData, rolls.length, sides]);

  if (!rollData) return null;

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => onFinishRef.current?.(), 200);
  };

  const hasDiceDetail = rolls.length > 0;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <style>{DICE_KEYFRAMES}</style>

      <button
        type="button"
        onClick={dismiss}
        title="Clique para fechar"
        className="pointer-events-auto w-full max-w-md rounded-2xl border border-red-800/80 bg-zinc-950/95 px-5 py-4 text-left shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur"
        style={{ animation: `${leaving ? 'dice-card-out 0.25s ease-in forwards' : 'dice-card-in 0.25s ease-out'}` }}
      >
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="truncate text-xs font-bold uppercase tracking-[0.18em] text-red-400">
            {rollData.label || 'Rolagem'}
          </span>
          <span className="shrink-0 text-xs text-zinc-500">{rollData.playerName}</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {hasDiceDetail
            ? faces.map((face, index) => (
                <Die
                  key={index}
                  sides={sides}
                  value={stopped[index] ? rolls[index] : face}
                  rolling={!stopped[index]}
                  isMax={stopped[index] && rolls[index] === sides}
                  isMin={stopped[index] && rolls[index] === 1}
                />
              ))
            : <Die sides={sides} value={showTotal ? total : faces[0]} rolling={!showTotal} />}

          {hasDiceDetail && modifier !== 0 && (
            <span className={`text-2xl font-black text-zinc-300 transition-opacity duration-300 ${showTotal ? 'opacity-100' : 'opacity-0'}`}>
              {modifier > 0 ? `+ ${modifier}` : `− ${Math.abs(modifier)}`}
            </span>
          )}

          {hasDiceDetail && (
            <span className={`flex items-center gap-3 transition-opacity duration-300 ${showTotal ? 'opacity-100' : 'opacity-0'}`}>
              <span className="text-2xl font-black text-zinc-500">=</span>
              <span className="min-w-14 rounded-xl border border-red-600 bg-red-950/60 px-3 py-1 text-center text-4xl font-black tabular-nums text-white" style={showTotal ? { animation: 'dice-total-pop 0.35s ease-out' } : undefined}>
                {total}
              </span>
            </span>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-500">{rollData.formula}</p>
      </button>
    </div>,
    document.body
  );
}

function randomFace(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/** Um dado em SVG, com formato de acordo com o número de lados. */
function Die({ sides, value, rolling, isMax = false, isMin = false }) {
  const tone = isMax
    ? { fill: '#b45309', stroke: '#fcd34d', text: '#fff7ed' }   // valor máximo: dourado
    : isMin
      ? { fill: '#3f3f46', stroke: '#71717a', text: '#d4d4d8' } // 1: apagado
      : { fill: '#991b1b', stroke: '#f87171', text: '#ffffff' };

  return (
    <div
      className="relative h-16 w-16"
      style={{ animation: rolling ? 'dice-tumble 0.45s linear infinite' : 'dice-land 0.3s ease-out' }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
        <DieShape sides={sides} fill={tone.fill} stroke={tone.stroke} />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums"
        style={{ color: tone.text, textShadow: '0 1px 3px rgba(0,0,0,0.7)', paddingTop: sides === 4 ? 14 : 0 }}
      >
        {value}
      </span>
    </div>
  );
}

function DieShape({ sides, fill, stroke }) {
  const common = { fill, stroke, strokeWidth: 4, strokeLinejoin: 'round' };
  const facet = { fill: 'none', stroke, strokeWidth: 2, opacity: 0.45 };

  switch (sides) {
    case 4:
      return <polygon points="50,8 94,88 6,88" {...common} />;
    case 6:
      return <rect x="10" y="10" width="80" height="80" rx="16" {...common} />;
    case 8:
      return <>
        <polygon points="50,4 94,50 50,96 6,50" {...common} />
        <polyline points="6,50 50,30 94,50" {...facet} />
        <line x1="50" y1="4" x2="50" y2="30" {...facet} />
      </>;
    case 10:
      return <>
        <polygon points="50,4 92,42 50,96 8,42" {...common} />
        <polyline points="8,42 50,58 92,42" {...facet} />
      </>;
    case 12:
      return <polygon points="50,5 93,36 77,90 23,90 7,36" {...common} />;
    default: // d20 e outros
      return <>
        <polygon points="50,4 91,27 91,73 50,96 9,73 9,27" {...common} />
        <polygon points="50,24 76,68 24,68" {...facet} />
      </>;
  }
}

const DICE_KEYFRAMES = `
@keyframes dice-tumble {
  0%   { transform: rotate(0deg)   translateY(0)    scale(1); }
  25%  { transform: rotate(90deg)  translateY(-6px) scale(0.95); }
  50%  { transform: rotate(180deg) translateY(0)    scale(1); }
  75%  { transform: rotate(270deg) translateY(-6px) scale(0.95); }
  100% { transform: rotate(360deg) translateY(0)    scale(1); }
}
@keyframes dice-land {
  0%   { transform: scale(1.25); }
  60%  { transform: scale(0.92); }
  100% { transform: scale(1); }
}
@keyframes dice-total-pop {
  0%   { transform: scale(0.6); }
  70%  { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes dice-card-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes dice-card-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(16px); }
}
`;