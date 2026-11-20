/**
 * Histórico de versões da ficha: cada vez que a ficha é salva, a versão anterior fica guardada
 * (as últimas 10, em attributes.versoes). Restaurar põe a versão no rascunho; só vale depois de salvar
 * — e a versão atual também vira uma versão, então dá para desfazer a restauração.
 */
const ATRIBUTOS = [['forca', 'For'], ['destreza', 'Des'], ['agilidade', 'Agi'], ['percepcao', 'Per'], ['inteligencia', 'Int'], ['vigor', 'Vig'], ['espirito', 'Esp']];

const quando = (iso) => {
  if (!iso) return 'Versão sem data';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Versão sem data' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export default function VersoesFicha({ versoes = [], onRestaurar, onFechar }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="versoes-titulo" onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-zinc-100">
        <div className="flex items-start justify-between gap-2">
          <h2 id="versoes-titulo" className="titulo-shinobi text-2xl">🕘 Versões da ficha</h2>
          <button type="button" onClick={onFechar} className="px-1 text-zinc-400 hover:text-white" aria-label="Fechar">✕</button>
        </div>
        <p className="text-sm text-zinc-400">A ficha guarda como estava antes de cada salvamento e de cada sugestão da IA aceita (as últimas 10). Restaurar coloca a versão na ficha; aperte “Salvar ficha” para guardar.</p>
        {!versoes.length && <p className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">Ainda não há versões. Elas aparecem quando você aceita uma sugestão da IA ou salva a ficha de novo.</p>}
        <ul className="space-y-2">
          {versoes.map((v, i) => {
            const at = v.attributes?.attributes || {};
            const poderes = (v.attributes?.powers_list || []).filter((p) => p.id).length;
            return (
              <li key={`${v.salva_em || 'sem'}-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{v.motivo || 'Versão salva'}</p>
                  <p className="text-xs text-zinc-300">{quando(v.salva_em)} · {v.name || 'Sem nome'}{v.clan ? ` — ${v.clan}` : ''}</p>
                  <p className="truncate text-xs text-zinc-400">NC {v.level || 4} · {ATRIBUTOS.map(([k, r]) => `${r} ${at[k] || 0}`).join(' ')} · {poderes} poder(es)</p>
                </div>
                <button type="button" onClick={() => onRestaurar?.(v)}
                  className="shrink-0 rounded-md border border-zinc-600 px-3 py-1.5 text-sm font-bold hover:border-red-600">Restaurar</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
