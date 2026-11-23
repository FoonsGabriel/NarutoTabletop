import { useState } from 'react';
import { ajudarFichaIA, iaConfigurada } from '../../../services/IA';

/**
 * Ajuda da IA na ficha (IA v1): o jogador pede o que quiser ("separa meus atributos", "melhora minha
 * história", "monta do zero"). A IA recebe a ficha como está e sugere só o que mudaria; aqui aparece
 * "antes → depois" e o jogador aceita ou pede outra. Aceitar muda só o rascunho: nada é salvo até
 * "Salvar ficha", e dá para voltar a versões antigas em 🕘 Versões. A IA sugere, o site valida.
 */
const ATRIBUTOS = { forca: 'Força', destreza: 'Destreza', agilidade: 'Agilidade', percepcao: 'Percepção', inteligencia: 'Inteligência', vigor: 'Vigor', espirito: 'Espírito' };

const ATALHOS = [
  'Montar a ficha do zero: ',
  'Separar meus atributos de acordo com meu clã e meu conceito',
  'Distribuir meus pontos de perícia',
  'Sugerir aptidões e poderes que combinem com meu personagem',
  'Ajustar minhas bases de combate para o meu estilo de luta',
  'Sugerir equipamento para comprar com meus Ryos',
  'Escrever uma história legal para o meu personagem',
];

export default function FichaComIA({ nc = 4, papel = 'geral', livre = false, liberados = [], ficha = {}, limites = {}, rotulosPericias = {}, onAplicar, onFechar }) {
  const [pedido, setPedido] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [pensando, setPensando] = useState(false);

  const pedir = async (e) => {
    e?.preventDefault();
    if (!pedido.trim() || pensando) return;
    setErro('');
    setPensando(true);
    try {
      setResultado(await ajudarFichaIA({ pedido: pedido.trim(), ficha, limites, nc, papel, livre, liberados }));
    } catch (err) {
      setErro(err.message);
    }
    setPensando(false);
  };

  const mudancas = resultado?.mudancas || {};
  const temMudanca = Object.keys(mudancas).length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="ia-ficha-titulo" onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-zinc-100">
        <div className="flex items-start justify-between gap-2">
          <h2 id="ia-ficha-titulo" className="titulo-shinobi text-2xl">✨ Ajuda da IA</h2>
          <button type="button" onClick={onFechar} className="px-1 text-zinc-400 hover:text-white" aria-label="Fechar">✕</button>
        </div>
        {!iaConfigurada && <p className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">A IA ainda não foi ligada neste site.</p>}

        {!resultado ? (
          <form onSubmit={pedir} className="space-y-3">
            <p className="text-sm text-zinc-300">A IA olha a sua ficha como está agora e sugere só o que você pedir. Você vê o antes e o depois e decide.</p>
            <div className="flex flex-wrap gap-1.5">
              {ATALHOS.map((a) => (
                <button key={a} type="button" onClick={() => setPedido(a)}
                  className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs text-zinc-300 hover:border-red-600 hover:text-white">
                  {a.replace(/: $/, '')}
                </button>
              ))}
            </div>
            <label htmlFor="ia-pedido" className="block text-sm font-bold text-zinc-300">O que você quer?</label>
            <textarea id="ia-pedido" value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={1200} rows={4}
              placeholder="Ex.: Meu ninja é um Aburame que luta de longe. Separa meus atributos para isso."
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-50 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none" />
            {livre && <p className="text-sm text-amber-200">🔓 O Mestre liberou as regras: a IA pode misturar poderes de clãs diferentes.</p>}
            {!livre && liberados.length > 0 && <p className="text-sm text-amber-200">📜 A IA sabe o que o Mestre liberou para você nas Regras da mesa.</p>}
            {erro && <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onFechar} className="flex-1 rounded-md border border-zinc-600 py-2 font-bold">Cancelar</button>
              <button type="submit" disabled={!pedido.trim() || pensando || !iaConfigurada}
                className="flex-1 rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">
                {pensando ? 'A IA está pensando…' : 'Pedir sugestão'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-zinc-950 px-3 py-2 text-zinc-400"><b className="text-zinc-200">Você pediu:</b> {pedido}</p>
            {resultado.explicacao && <p className="text-zinc-200">{resultado.explicacao}</p>}
            {temMudanca && <Diferencas ficha={ficha} mudancas={mudancas} nomes={resultado.nomes || {}} rotulosPericias={rotulosPericias} />}
            {resultado.avisos?.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md border border-amber-700 bg-amber-950/40 py-2 pl-7 pr-3 text-amber-100">
                {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
            {temMudanca && <p className="text-xs text-zinc-500">Aceitar muda só o rascunho (para guardar, aperte “Salvar ficha”). Se não gostar, volte em 🕘 Versões.</p>}
            {erro && <p role="alert" className="rounded-md border border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-100">{erro}</p>}
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setResultado(null)} className="rounded-md border border-zinc-600 py-2 font-bold">Mudar pedido</button>
              <button type="button" onClick={pedir} disabled={pensando} className="rounded-md border border-zinc-600 py-2 font-bold disabled:opacity-50">
                {pensando ? 'Pensando…' : 'Pedir outra'}
              </button>
              <button type="button" disabled={!temMudanca || pensando} onClick={() => { onAplicar?.(mudancas, pedido.trim()); onFechar?.(); }}
                className="rounded-md bg-red-600 py-2 font-extrabold text-zinc-50 hover:bg-red-700 disabled:opacity-50">Aceitar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Antes → depois" de cada parte que a IA mudou. */
function Diferencas({ ficha, mudancas, nomes, rotulosPericias }) {
  const nome = (id) => nomes[id] || id;
  const linhas = [];
  for (const [campo, rotulo] of [['nome', 'Nome'], ['cla', 'Clã'], ['segundo_cla', 'Segundo clã'], ['vila', 'Vila']]) {
    if (mudancas[campo] !== undefined) linhas.push(<Linha key={campo} rotulo={rotulo} antes={ficha[campo] || '—'} depois={mudancas[campo]} />);
  }
  if (mudancas.atributos) {
    const itens = Object.entries(ATRIBUTOS)
      .filter(([k]) => Number(ficha.atributos?.[k] || 0) !== Number(mudancas.atributos[k] || 0))
      .map(([k, r]) => <Linha key={k} rotulo={r} antes={ficha.atributos?.[k] || 0} depois={mudancas.atributos[k] || 0} />);
    linhas.push(<Bloco key="atributos" titulo="Atributos">{itens.length ? itens : <p className="text-zinc-500">Sem mudança.</p>}</Bloco>);
  }
  if (mudancas.pericias) {
    const chaves = [...new Set([...Object.keys(ficha.pericias || {}), ...Object.keys(mudancas.pericias)])];
    const itens = chaves
      .filter((k) => Number(ficha.pericias?.[k] || 0) !== Number(mudancas.pericias[k] || 0))
      .map((k) => <Linha key={k} rotulo={rotulosPericias[k] || k} antes={ficha.pericias?.[k] || 0} depois={mudancas.pericias[k] || 0} />);
    linhas.push(<Bloco key="pericias" titulo="Pontos de perícia">{itens.length ? itens : <p className="text-zinc-500">Sem mudança.</p>}</Bloco>);
  }
  if (mudancas.sociais) {
    const itens = [['carisma', 'Carisma'], ['manipulacao', 'Manipulação']]
      .filter(([k]) => Number(ficha.sociais?.[k] || 0) !== Number(mudancas.sociais[k] || 0))
      .map(([k, r]) => <Linha key={k} rotulo={r} antes={ficha.sociais?.[k] || 0} depois={mudancas.sociais[k] || 0} />);
    linhas.push(<Bloco key="sociais" titulo="Pontos sociais">{itens.length ? itens : <p className="text-zinc-500">Sem mudança.</p>}</Bloco>);
  }
  if (mudancas.combate_base) {
    const BASES = [['cc', 'Combate Corporal'], ['cd', 'Combate à Distância'], ['esq', 'Esquiva'], ['lm', 'Ler Movimento']];
    const itens = BASES
      .filter(([k]) => Number(ficha.combate_base?.[k] ?? 3) !== Number(mudancas.combate_base[k] ?? 3))
      .map(([k, r]) => <Linha key={k} rotulo={r} antes={ficha.combate_base?.[k] ?? 3} depois={mudancas.combate_base[k] ?? 3} />);
    linhas.push(<Bloco key="bases" titulo="Bases de combate">{itens.length ? itens : <p className="text-zinc-500">Sem mudança.</p>}</Bloco>);
  }
  if (mudancas.equipamento) {
    const eq = mudancas.equipamento;
    const n = (id) => eq.nomes?.[id] || nome(id);
    linhas.push(
      <Bloco key="equip" titulo={`Compras (${eq.custo} Ryos)`}>
        {(eq.armas || []).map((id) => <p key={id} className="text-emerald-300">+ {n(id)}</p>)}
        {Object.entries(eq.itens || {}).map(([id, q]) => <p key={id} className="text-emerald-300">+ {n(id)}{q > 1 ? ` ×${q}` : ''}</p>)}
        {eq.armadura && <p className="text-emerald-300">+ {n(eq.armadura)} (armadura; troca a atual)</p>}
        <Linha rotulo="Ryos" antes={eq.ryo_antes ?? ficha.equipamento?.ryo ?? 100} depois={(eq.ryo_antes ?? ficha.equipamento?.ryo ?? 100) - eq.custo} />
      </Bloco>,
    );
  }
  if (mudancas.aptidoes_gratuitas) {
    linhas.push(<Bloco key="apt" titulo="Aptidões gratuitas"><Lista antes={(ficha.aptidoes_gratuitas || []).map(nome)} depois={mudancas.aptidoes_gratuitas.map(nome)} /></Bloco>);
  }
  if (mudancas.aptidoes_extra) {
    linhas.push(<Bloco key="aptx" titulo="Aptidões extras (2 pontos de poder cada)"><Lista antes={(ficha.aptidoes_extra || []).map(nome)} depois={mudancas.aptidoes_extra.map(nome)} /></Bloco>);
  }
  if (mudancas.poderes) {
    const txt = (p) => `${p.nome_proprio ? `${p.nome_proprio} — ` : ''}${nome(p.id)} (nível ${p.nivel})${p.efeitos?.length ? `: ${p.efeitos.map(nome).join(', ')}` : ''}`;
    linhas.push(<Bloco key="pod" titulo="Poderes"><Lista antes={(ficha.poderes || []).map((p) => txt({ ...p, nome_proprio: p.nome }))} depois={mudancas.poderes.map(txt)} /></Bloco>);
  }
  if (mudancas.complementos) {
    // A IA manda chaves (destreza, furtividade); aqui mostra o nome bonito.
    const ATR = { forca: 'Força', destreza: 'Destreza', agilidade: 'Agilidade', percepcao: 'Percepção', inteligencia: 'Inteligência', vigor: 'Vigor', espirito: 'Espírito' };
    const rotulo = (v) => (v && (ATR[v] || rotulosPericias[v] || v[0].toUpperCase() + v.slice(1))) || '—';
    const itens = Object.entries(mudancas.complementos).map(([id, v]) => <Linha key={id} rotulo={nome(id)} antes={rotulo(ficha.complementos?.[id])} depois={rotulo(v)} />);
    linhas.push(<Bloco key="comp" titulo="Complementos das aptidões">{itens}</Bloco>);
  }
  for (const [campo, rotulo] of [['conceito', 'Conceito'], ['historia', 'História']]) {
    if (mudancas[campo] === undefined) continue;
    linhas.push(
      <Bloco key={campo} titulo={rotulo}>
        {ficha[campo] && <p className="line-clamp-3 text-zinc-500 line-through decoration-zinc-600">{ficha[campo]}</p>}
        <p className="whitespace-pre-wrap text-zinc-100">{mudancas[campo]}</p>
      </Bloco>,
    );
  }
  return <div className="space-y-2">{linhas}</div>;
}

function Bloco({ titulo, children }) {
  return (
    <div className="space-y-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2">
      <p className="font-bold text-zinc-200">{titulo}</p>
      {children}
    </div>
  );
}

function Linha({ rotulo, antes, depois }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-zinc-300">{rotulo}</span>
      <span className="tabular-nums"><span className="text-zinc-500">{antes}</span> → <b className="text-emerald-300">{depois}</b></span>
    </p>
  );
}

function Lista({ antes, depois }) {
  const sai = antes.filter((x) => !depois.includes(x));
  const entra = depois.filter((x) => !antes.includes(x));
  const fica = depois.filter((x) => antes.includes(x));
  return (
    <div className="space-y-0.5">
      {fica.map((x) => <p key={`f${x}`} className="text-zinc-300">• {x}</p>)}
      {entra.map((x) => <p key={`e${x}`} className="text-emerald-300">+ {x}</p>)}
      {sai.map((x) => <p key={`s${x}`} className="text-red-300 line-through">− {x}</p>)}
      {!antes.length && !depois.length && <p className="text-zinc-500">Nenhuma.</p>}
    </div>
  );
}
