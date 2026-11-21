import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase/client';
import { apagarRegra, criarRegra, editarRegra, listarRegras } from '../services/RegrasMesa';
import { iaConfigurada, interpretarRegraIA } from '../services/IA';

/**
 * 📜 Regras da mesa (PLANEJAMENTO-IA seção 5).
 * Mestre: cria (à mão ou com a IA), edita, apaga, oculta/mostra, "esta mesa" ou "todas as minhas mesas".
 * Jogador: vê só as regras visíveis. Liberações de poder/aptidão também aparecem na ficha de quem foi liberado.
 * liberaveis: itens do sistema que podem ser liberados [{ id, nome, tipo: 'poder' | 'aptidao', cla }].
 */
const VAZIA = { id: null, texto: '', tipo: 'livre', itens: [], personagem_id: '', todasMesas: false, visivel: false };

export default function RegrasMesaPanel({ roomId, isGM, playerId, liberaveis = [] }) {
  const [gmId, setGmId] = useState(null);
  const [regras, setRegras] = useState(null);
  const [personagens, setPersonagens] = useState([]);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(null); // regra sendo criada/editada
  const [pedidoIA, setPedidoIA] = useState('');
  const [pensando, setPensando] = useState(false);
  const [explicacaoIA, setExplicacaoIA] = useState('');

  const nomeItem = useMemo(() => Object.fromEntries(liberaveis.map((i) => [i.id, i.nome])), [liberaveis]);
  const nomePersonagem = useMemo(() => Object.fromEntries(personagens.map((p) => [p.id, p.name])), [personagens]);

  const carregar = useCallback(async () => {
    try {
      const { data: sala } = await supabase.from('rooms').select('gm_id').eq('id', roomId).single();
      setGmId(sala?.gm_id || null);
      const todas = await listarRegras(roomId, sala?.gm_id, { souMestre: isGM });
      setRegras(isGM ? todas : todas.filter((r) => r.visivel));
      setErro('');
    } catch (e) {
      setErro(e.message);
      setRegras([]);
    }
  }, [roomId, isGM]);

  useEffect(() => {
    carregar();
    if (isGM) {
      supabase.from('characters').select('id, name, owner_id, is_npc, attributes').eq('room_id', roomId)
        .then(({ data }) => setPersonagens((data || []).filter((c) => !c.is_npc && !c.attributes?.criatura)));
    }
    const canal = supabase.channel(`regras_mesa_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regras_mesa' }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [roomId, isGM, carregar]);

  const salvar = async () => {
    const texto = form.texto.trim();
    if (!texto) return setErro('Escreva a regra.');
    if (form.tipo === 'liberar' && !form.itens.length) return setErro('Escolha pelo menos um poder ou aptidão para liberar.');
    const linha = {
      texto,
      tipo: form.tipo,
      visivel: form.visivel,
      room_id: form.todasMesas ? null : roomId,
      dados: form.tipo === 'liberar' ? { itens: form.itens, personagem_id: form.personagem_id || null } : {},
    };
    try {
      if (form.id) await editarRegra(form.id, linha);
      else await criarRegra({ ...linha, mestre_id: gmId || playerId });
      setForm(null);
      setExplicacaoIA('');
      setErro('');
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const apagar = async (r) => {
    if (!window.confirm(`Apagar a regra "${r.texto.slice(0, 60)}"? Não dá para desfazer.`)) return;
    try {
      await apagarRegra(r.id);
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const alternarVisivel = async (r) => {
    try {
      await editarRegra(r.id, { visivel: !r.visivel });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const criarComIA = async (e) => {
    e.preventDefault();
    if (!pedidoIA.trim() || pensando) return;
    setPensando(true);
    setErro('');
    try {
      const r = await interpretarRegraIA({ texto: pedidoIA.trim(), personagens: personagens.map((p) => ({ id: p.id, nome: p.name })) });
      setForm({
        ...VAZIA,
        texto: r.texto || pedidoIA.trim(),
        tipo: r.tipo === 'liberar' && r.itens?.length ? 'liberar' : 'livre',
        itens: (r.itens || []).map((i) => i.id),
        personagem_id: r.personagem_id || '',
      });
      setExplicacaoIA(r.explicacao || '');
      setPedidoIA('');
    } catch (err) {
      setErro(err.message);
    }
    setPensando(false);
  };

  if (!regras) return <p className="text-xs text-zinc-500">Carregando regras do Mestre…</p>;

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-sm font-bold text-zinc-100">Regras do Mestre</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {isGM
            ? 'Valem mais que o livro. A IA usa todas ao responder; as ocultas ela aplica sem dizer que foi você.'
            : 'Regras da casa desta mesa. Valem mais que o livro.'}
        </p>
      </div>

      {erro && <p role="alert" className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-100">{erro}</p>}

      {regras.length === 0 && !form && (
        <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-center text-xs text-zinc-500">
          {isGM ? 'Nenhuma regra ainda. Crie a primeira abaixo.' : 'O Mestre ainda não mostrou nenhuma regra da casa.'}
        </p>
      )}

      <ul className="space-y-2">
        {regras.map((r) => (
          <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="whitespace-pre-wrap text-sm text-zinc-100">{r.texto}</p>
            {r.tipo === 'liberar' && (
              <p className="mt-1 text-[11px] text-amber-200">
                🔓 Libera {(r.dados?.itens || []).map((i) => nomeItem[i] || i).join(', ')} para{' '}
                {r.dados?.personagem_id ? (nomePersonagem[r.dados.personagem_id] || 'um personagem') : 'todos da mesa'}
              </p>
            )}
            {isGM && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 font-bold ${r.visivel ? 'bg-emerald-950/60 text-emerald-200' : 'bg-zinc-800 text-zinc-300'}`}>{r.visivel ? '👁️ Jogadores veem' : '🔒 Só você vê'}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-bold text-zinc-300">{r.room_id ? 'Esta mesa' : 'Todas as suas mesas'}</span>
                <span className="flex-1" />
                <button type="button" onClick={() => alternarVisivel(r)} className="rounded border border-zinc-700 px-2 py-0.5 font-bold text-zinc-300 hover:border-red-600">{r.visivel ? 'Ocultar' : 'Mostrar'}</button>
                <button type="button" onClick={() => { setExplicacaoIA(''); setForm({ id: r.id, texto: r.texto, tipo: r.tipo, itens: r.dados?.itens || [], personagem_id: r.dados?.personagem_id || '', todasMesas: !r.room_id, visivel: r.visivel }); }}
                  className="rounded border border-zinc-700 px-2 py-0.5 font-bold text-zinc-300 hover:border-red-600">Editar</button>
                <button type="button" onClick={() => apagar(r)} className="rounded border border-zinc-700 px-2 py-0.5 font-bold text-red-300 hover:border-red-600">Apagar</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isGM && !form && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <form onSubmit={criarComIA} className="space-y-1.5">
            <label htmlFor="regra-ia" className="block text-xs font-bold text-zinc-300">✨ Criar com a IA</label>
            <textarea id="regra-ia" rows={2} value={pedidoIA} onChange={(e) => setPedidoIA(e.target.value)} maxLength={1200}
              placeholder="Ex.: Na roleta, o Gabriel tirou Areia de Ferro: pode usar mesmo sendo Aburame."
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none" />
            <button type="submit" disabled={!pedidoIA.trim() || pensando || !iaConfigurada}
              className="w-full rounded-md bg-red-700 py-1.5 text-sm font-bold text-zinc-50 hover:bg-red-600 disabled:opacity-50">
              {pensando ? 'A IA está montando a regra…' : iaConfigurada ? 'Montar regra' : 'IA desligada'}
            </button>
          </form>
          <button type="button" onClick={() => { setExplicacaoIA(''); setForm({ ...VAZIA }); }}
            className="w-full rounded-md border border-zinc-700 py-1.5 text-sm font-bold text-zinc-200 hover:border-red-600">＋ Escrever regra à mão</button>
        </div>
      )}

      {isGM && form && (
        <FormRegra form={form} setForm={setForm} personagens={personagens} liberaveis={liberaveis} nomeItem={nomeItem}
          explicacaoIA={explicacaoIA} onSalvar={salvar} onCancelar={() => { setForm(null); setExplicacaoIA(''); setErro(''); }} />
      )}
    </div>
  );
}

function FormRegra({ form, setForm, personagens, liberaveis, nomeItem, explicacaoIA, onSalvar, onCancelar }) {
  const [busca, setBusca] = useState('');
  const muda = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (t.length < 2) return [];
    return liberaveis
      .filter((i) => !form.itens.includes(i.id))
      .filter((i) => `${i.nome} ${[].concat(i.cla || []).join(' ')}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t))
      .slice(0, 8);
  }, [busca, liberaveis, form.itens]);

  const Opcao = ({ nome, valor, campo, children }) => (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
      <input type="radio" name={nome} checked={form[campo] === valor} onChange={() => muda(campo, valor)} className="accent-red-600" />
      {children}
    </label>
  );

  return (
    <div className="space-y-3 rounded-lg border border-red-900/60 bg-zinc-950 p-3">
      <p className="text-sm font-bold text-zinc-100">{form.id ? 'Editar regra' : 'Nova regra'}</p>
      {explicacaoIA && <p className="rounded-md bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-400">✨ {explicacaoIA} Confira e salve.</p>}

      <div>
        <label htmlFor="regra-texto" className="mb-1 block text-xs font-bold text-zinc-300">Regra</label>
        <textarea id="regra-texto" rows={3} value={form.texto} onChange={(e) => muda('texto', e.target.value)} maxLength={1500}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-50 focus:border-red-500 focus:outline-none" />
      </div>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-bold text-zinc-300">Tipo</legend>
        <Opcao nome="tipo" valor="livre" campo="tipo">Só texto (você decide na hora)</Opcao>
        <Opcao nome="tipo" valor="liberar" campo="tipo">Liberar poder/aptidão de outro clã (a ficha aceita sozinha)</Opcao>
      </fieldset>

      {form.tipo === 'liberar' && (
        <div className="space-y-2 rounded-md border border-zinc-800 p-2">
          <div className="flex flex-wrap gap-1">
            {form.itens.map((id) => (
              <button key={id} type="button" onClick={() => muda('itens', form.itens.filter((x) => x !== id))}
                className="rounded-full border border-amber-700 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-100" title="Tirar">
                {nomeItem[id] || id} ✕
              </button>
            ))}
            {!form.itens.length && <span className="text-[11px] text-zinc-500">Nada escolhido ainda.</span>}
          </div>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar poder ou aptidão (ex.: Satetsu)"
            aria-label="Buscar poder ou aptidão para liberar"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none" />
          {achados.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {achados.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => { muda('itens', [...form.itens, i.id]); setBusca(''); }}
                    className="w-full rounded px-2 py-1 text-left text-xs text-zinc-200 hover:bg-zinc-800">
                    {i.tipo === 'poder' ? '🌀' : '⭐'} {i.nome} <span className="text-zinc-500">· {[].concat(i.cla || []).join(' ou ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="block text-xs font-bold text-zinc-300">
            Para quem
            <select value={form.personagem_id} onChange={(e) => muda('personagem_id', e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm font-normal text-zinc-50">
              <option value="">Todos da mesa</option>
              {personagens.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-bold text-zinc-300">Vale para</legend>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input type="radio" name="alcance" checked={!form.todasMesas} onChange={() => muda('todasMesas', false)} className="accent-red-600" /> Só esta mesa
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input type="radio" name="alcance" checked={form.todasMesas} onChange={() => muda('todasMesas', true)} className="accent-red-600" /> Todas as minhas mesas
        </label>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs font-bold text-zinc-300">Quem vê</legend>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input type="radio" name="visivel" checked={!form.visivel} onChange={() => muda('visivel', false)} className="accent-red-600" /> Só eu (a IA usa sem contar que é sua)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
          <input type="radio" name="visivel" checked={form.visivel} onChange={() => muda('visivel', true)} className="accent-red-600" /> Jogadores também
        </label>
      </fieldset>

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 rounded-md border border-zinc-700 py-1.5 text-sm font-bold text-zinc-300">Cancelar</button>
        <button type="button" onClick={onSalvar} className="flex-1 rounded-md bg-red-700 py-1.5 text-sm font-extrabold text-zinc-50 hover:bg-red-600">Salvar regra</button>
      </div>
    </div>
  );
}
