import { useEffect, useRef, useState } from 'react';
import { onUndoStack, undoEntry } from '../services/Undo';

/** Botão ↩ do Mestre: lista as últimas ações de combate e desfaz a escolhida. */
export default function UndoButton() {
  const [stack, setStack] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const boxRef = useRef(null);

  useEffect(() => onUndoStack(setStack), []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const undo = async (entry) => {
    setBusy(entry.id);
    const { error } = await undoEntry(entry);
    setBusy('');
    if (error) alert('Não deu para desfazer: ' + error.message);
  };

  const ago = (at) => {
    const s = Math.round((Date.now() - at) / 1000);
    return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!stack.length}
        title="Desfazer a última ação de combate"
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-bold text-zinc-200 hover:border-red-600 disabled:opacity-40 md:px-3"
      >
        ↩<span className="hidden md:inline"> Desfazer</span>{stack.length ? ` (${stack.length})` : ''}
      </button>

      {open && stack.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl">
          <p className="border-b border-zinc-800 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Últimas ações (a de cima é a mais nova)
          </p>
          <ul className="max-h-80 overflow-y-auto">
            {stack.map((entry, i) => (
              <li key={entry.id} className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-zinc-100">{entry.label}</p>
                  <p className="text-[10px] text-zinc-500">há {ago(entry.at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => undo(entry)}
                  disabled={Boolean(busy)}
                  className={`shrink-0 rounded px-2 py-1 font-bold ${i === 0 ? 'bg-red-600 text-white' : 'border border-zinc-700 text-zinc-300'} disabled:opacity-50`}
                >
                  {busy === entry.id ? '…' : 'Desfazer'}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 text-[10px] text-zinc-600">Volta Vitalidade, Chakra e modos do jeito que estavam antes da ação.</p>
        </div>
      )}
    </div>
  );
}
