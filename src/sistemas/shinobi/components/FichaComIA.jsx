import { useState } from 'react';
import { iaConfigurada, sugerirFichaIA } from '../../../services/IA';

/**
 * Montar a ficha com a ajuda da IA (IA v1): o jogador descreve o personagem e a IA sugere
 * nome, clã, vila, atributos, aptidões e poderes. A sugestão entra no rascunho da ficha e
 * a própria ficha confere tudo (pendências em cada aba) — a IA sugere, o site valida.
 */
const ROTULOS = { forca: 'Força', destreza: 'Destreza', agilidade: 'Agilidade', percepcao: 'Percepção', inteligencia: 'Inteligência', vigor: 'Vigor', espirito: 'Espírito' };

export default function FichaComIA({ nc = 4, papel = 'geral', onAplicar, onFechar }) {
  const [descricao, setDescricao] = useState('');
  const [sugestao, setSugestao] = useState(null);
  const [erro, setErro] = useState('');
  const [pensando, setPensando] = useState(false);

  const pedir = async (e) => {
    e.preventDefault();
    setErro('');
    setPensando(true);
    try {
      setSugestao(await sugerirFichaIA({ descricao: descricao.trim(), nc, papel }));
    } catch (err) {
      setErro(err.message);
    }
    setPensando(false);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="ia-ficha-titulo" onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-zinc-100">
        <h2 id="ia-ficha-titulo" className="titulo-shinobi text-2xl">✨ Montar com a IA</h2>
        {!iaConfigurada && <p className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">A IA ainda não foi ligada neste site.</p>}
        {!sugestao ? (
          <form onSubmit={pedir} className="space-y-3">
            <label htmlFor="ia-descricao" className="block text-sm font-bold text-zinc-300">Descreva o seu ninja</label>
            <textarea id="ia-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1200} rows={4}
              placeholder="Ex.: Um Hyuuga calmo que protege os colegas, bom em defesa e Taijutsu."
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none" />
            <p className="text-sm text-zinc-400">A IA sugere e você confere. Nada é salvo até você apertar “Salvar ficha”.</p>
            {erro && <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onFechar} className="flex-1 rounded-md border border-zinc-600 py-2 font-bold">Cancelar</button>
              <button type="submit" disabled={descricao.trim().length < 3 || pensando || !iaConfigurada}
                className="flex-1 rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">
                {pensando ? 'A IA está montando…' : 'Pedir sugestão'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-lg font-bold">{sugestao.nome || 'Sem nome'}{sugestao.cla ? ` — ${sugestao.cla}` : ''}</p>
            {sugestao.explicacao && <p className="text-zinc-300">{sugestao.explicacao}</p>}
            <p><b>Atributos:</b> {Object.entries(sugestao.atributos || {}).map(([k, v]) => `${ROTULOS[k] || k} ${v}`).join(', ')}</p>
            <p><b>Aptidões gratuitas:</b> {(sugestao.aptidoes_nomes || sugestao.aptidoes_gratuitas || []).join(', ') || 'nenhuma'}</p>
            <p><b>Poderes:</b> {(sugestao.poderes || []).map((p) => `${p.nome || p.id} (nível ${p.nivel})`).join(', ') || 'nenhum'}</p>
            {sugestao.avisos?.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md border border-amber-700 bg-amber-950/40 py-2 pl-7 pr-3 text-amber-100">
                {sugestao.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setSugestao(null)} className="flex-1 rounded-md border border-zinc-600 py-2 font-bold">Pedir outra</button>
              <button type="button" onClick={() => { onAplicar(sugestao); onFechar(); }} className="flex-1 rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700">Usar na ficha</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
