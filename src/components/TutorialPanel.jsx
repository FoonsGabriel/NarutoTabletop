import { useState } from 'react';

/**
 * 📚 Guia rápido: as regras mais usadas do Livro Básico (Shinobi no Sho 4.1b),
 * em frases curtas, com a página para quem quiser ler o texto completo.
 */
const GUIA = [
  {
    id: 'testes',
    titulo: '🎲 Como rolar um teste',
    pagina: 'págs. 248–250',
    linhas: [
      'Role 2 dados de 8 lados (2d8) e some a precisão: o valor da perícia, atributo ou habilidade usada.',
      'Se o total for igual ou maior que a dificuldade, deu certo.',
      'Contra alguém: a dificuldade é 9 + a precisão do alvo.',
      'Teste contra teste: os dois rolam e o maior vence. Empate: vence a maior precisão; se for igual, rolam de novo.',
      '15 ou 16 nos dados é sempre sucesso (crítico). 2 ou 3 é sempre falha.',
    ],
    tabela: [
      ['Rotineira', '4'], ['Muito fácil', '8'], ['Fácil', '12'], ['Média', '16'],
      ['Difícil', '20'], ['Muito difícil', '24'], ['Absurda', '28'],
    ],
  },
  {
    id: 'iniciativa',
    titulo: '⏱️ Iniciativa e turnos',
    pagina: 'pág. 253',
    linhas: [
      'No começo da luta cada um rola Iniciativa = 1 dado + Agilidade + Prontidão.',
      'Quem tirou mais age primeiro, e a ordem vale para o combate inteiro.',
      'Empate: age primeiro quem tem mais precisão; se ainda empatar, cada um rola 1 dado.',
      'Efeitos que duram "X turnos" contam nos turnos de quem recebeu o efeito.',
    ],
  },
  {
    id: 'acoes',
    titulo: '⚔️ O que dá para fazer no turno',
    pagina: 'págs. 254–255',
    linhas: [
      'Por rodada: 1 Padrão + 1 Movimento + 1 Parcial, OU 1 Completa + 1 Parcial.',
      'Padrão: atacar, usar técnica ou poder no inimigo.',
      'Movimento: andar, usar técnica de suporte em si mesmo.',
      'Parcial: técnica defensiva, manter um efeito sustentado.',
      'Completa: técnicas mais difíceis ou correr muito; gasta a Padrão e o Movimento juntos.',
      'Pode trocar uma ação maior por uma menor (Padrão vira Movimento), nunca o contrário.',
      'Ações livres (falar) e reações (defender) são ilimitadas, mas não repetem a mesma.',
      'Ação usada não volta, mesmo se falhar.',
    ],
  },
  {
    id: 'defesas',
    titulo: '🛡️ Como se defender',
    pagina: 'págs. 255–256',
    linhas: [
      'Esquivar: não rola nada; o atacante precisa tirar 9 + sua Esquiva.',
      'Bloquear: você rola Combate Corporal contra o ataque. Precisa ter algo na mão que aguente o golpe. Não dá contra quem é 2 tamanhos maior.',
      'Antecipar: você rola Ler Movimento contra o ataque para prever e desviar.',
      'Defender com técnica: rola Ler Movimento, gasta chakra e a ação que a técnica pedir.',
      'Ordem: quem ataca anuncia, quem defende escolhe a defesa, depois todos rolam.',
      'Flanqueado (inimigo entre dois atacantes corpo a corpo): −1 na defesa.',
    ],
  },
  {
    id: 'dano',
    titulo: '💥 Quanto dano causa',
    pagina: 'págs. 257–258',
    linhas: [
      'Corpo a corpo: Força ÷ 2 (arredonda para cima) + dano da arma.',
      'À distância com arma: Destreza ÷ 2 + dano da arma.',
      'Ninpou e elementos: Espírito ÷ 2 + nível do poder usado.',
      'Dano final = dano base × grau. O grau vem do resultado dos 2 dados do ataque:',
    ],
    tabela: [
      ['2 ou 3', 'Falha crítica'], ['4 a 8', 'Grau 1'], ['9 a 11', 'Grau 2'],
      ['12 a 14', 'Grau 3'], ['15 ou 16', 'Crítico: grau 4 + sangrando'],
    ],
  },
  {
    id: 'vida',
    titulo: '❤️ Vitalidade, ferimentos e morte',
    pagina: 'págs. 258–259',
    linhas: [
      'Vitalidade = 10 + 3 × Vigor + 5 × NC. Chakra = 10 + 3 × Espírito.',
      '0: fora de combate, indefeso, mas acordado.',
      '−1 a −10: inconsciente.',
      '−11 a −20: morrendo (inconsciente e sangrando, −2 por turno).',
      '−21 ou menos: morto.',
      'Estabilizar quem sangra: Vigor dificuldade 18 (reação) ou Medicina dificuldade 16 (ação Padrão).',
      'Uma noite de sono recupera 10 + 2 × Vigor de Vitalidade. Voltando a 1 ou mais, a pessoa acorda.',
    ],
  },
  {
    id: 'sangrando',
    titulo: '🩸 Sangrando',
    pagina: 'pág. 277',
    linhas: [
      'Perde 2 de Vitalidade no começo de cada turno.',
      'Acumula: sangrando ×2 perde 4, ×3 perde 6…',
      'Acontece em todo acerto crítico.',
      'Cada teste de estabilização (Vigor 18 ou Medicina 16) tira um nível de sangramento.',
    ],
  },
  {
    id: 'movimento',
    titulo: '👣 Andar no mapa',
    pagina: 'pág. 262',
    linhas: [
      'Deslocamento = 10 m + Agilidade ÷ 2. No mapa, cada bloco vale 2 m.',
      'Uma ação de Movimento anda o seu deslocamento. Trocando a Padrão por Movimento, anda o dobro.',
      'Terreno difícil (marcado pelo Mestre) custa mais para atravessar.',
    ],
  },
  {
    id: 'manobras',
    titulo: '🥷 Manobras úteis',
    pagina: 'págs. 262–264',
    linhas: [
      'Fintar (Padrão): Agilidade contra a Prontidão do alvo. Se ganhar, ele fica com −2 na defesa contra o seu próximo ataque corpo a corpo.',
      'Golpe de misericórdia (Completa): contra alguém indefeso, crítico automático; o alvo faz Vigor 10 ou morre/desmaia.',
      'Atirar ou arremessar com um inimigo colado em você: −3 de precisão.',
      'Arma que você não sabe usar (sem a aptidão Usar Arma): −3 de precisão.',
    ],
  },
  {
    id: 'elementos',
    titulo: '🔥 Confronto de elementos',
    pagina: 'pág. 89',
    linhas: [
      'Katon vence Fuuton, que vence Raiton, que vence Doton, que vence Suiton, que vence Katon.',
      'Quando duas técnicas de elementos se chocam, o elemento forte leva vantagem.',
    ],
  },
  {
    id: 'evolucao',
    titulo: '📈 Subir de nível',
    pagina: 'págs. 30–32',
    linhas: [
      'Cada Nível de Campanha (NC) dá +6 em Atributos, +4 em Perícias e +2 em Poderes.',
      'Regra opcional: juntando 100 de EXP, o Mestre sobe o NC e a EXP zera.',
      'Nenhum atributo passa do NC. O mínimo sobe 1 a cada NC ímpar: gaste primeiro nos atributos mais baixos.',
      'Pode guardar os pontos novos para gastar depois.',
    ],
  },
  {
    id: 'condicoes',
    titulo: '😵 Condições (efeitos ruins)',
    pagina: 'págs. 275–278',
    linhas: [
      'Aparecem como ícone no nome do token e já mudam ataque, defesa, ações e deslocamento sozinhas.',
      'Penalidades de várias condições somam, mas no máximo −3 num mesmo teste.',
      'Se uma condição é mais grave que outra da mesma linha (fatigado → exausto), vale só a mais grave.',
      'O teste para se livrar de uma condição não sofre a penalidade dela.',
      'Vitalidade 0: indefeso. Abaixo de 0: inconsciente. Chakra 0: exausto.',
      'O Mestre adiciona ou tira condições no cartão do token (toque no token).',
    ],
  },
  {
    id: 'genjutsu',
    titulo: '🌀 Genjutsu (ilusões)',
    pagina: 'págs. 233–238',
    linhas: [
      'Genjutsu não tem teste de ataque: o alvo testa Inteligência contra a dificuldade de quem lançou.',
      'Compulsão dura até a vítima se libertar; Aflição dura 2 turnos; Fantasma engana quem olha.',
      'A partir do 2º turno, a vítima tenta Notar Genjutsu antes de agir (ação livre, Dif −1 a cada tentativa).',
      'Notou? Ainda precisa do Kai para sair. Dano igual ou maior que o dobro do custo também quebra.',
      'Um genjutsu novo na mesma vítima cancela o anterior.',
    ],
  },
  {
    id: 'cobertura',
    titulo: '🌫️ Camuflagem e cobertura',
    pagina: 'pág. 273',
    linhas: [
      'Camuflagem parcial (névoa, folhagem): depois de acertar, o atacante rola 1d8; 2 ou menos = errou.',
      'Camuflagem total (escuridão, invisível): erra com 4 ou menos. Sem saber onde o alvo está, não dá para atacar.',
      'Crítico ignora a camuflagem. Sensores sabem onde o alvo está, mas ainda rolam o erro.',
      'Cobertura parcial (árvore, pilastra) já existente: +3 na defesa. Marque "Alvo com cobertura parcial" ao atacar.',
      'Cobertura total: projéteis e golpes não passam; o dano que quebrar a parede passa adiante.',
    ],
  },
  {
    id: 'objetos',
    titulo: '🧱 Quebrar objetos e cair',
    pagina: 'págs. 274–275',
    linhas: [
      'Acertar objeto parado: Dif 5. Em movimento: Dif 9. Na mão de alguém: use Desarmar.',
      'Quebra se o dano base for igual ou maior que a dureza. Se não quebrar, a dureza cai 2.',
      'Contra dano fixo, a dureza vale o dobro. Barreira na frente: o dano passa menos a dureza.',
      'Dureza de corpo (Pele de Pedra, Resiliência…) tira do dano base de todo ataque e não acumula.',
      'Queda: 1 de dano fixo por metro (máx. 2 × Vigor). Acrobacia (ou Atletismo, se saltou): −1 m a cada 2 pontos acima de 9.',
    ],
    tabela: [['Pote, pergaminho, corda, livro', '0'], ['Cadeira, porta de madeira', '5'], ['Porta de pedra', '8'], ['Corrente, porta de ferro', '10']],
  },
  {
    id: 'parceiros',
    titulo: '🐸 Parceiros, montarias e voo',
    pagina: 'págs. 269–270',
    linhas: [
      'Parceiro (clone, invocação, animal): age no seu turno, sem iniciativa; dar ordem é ação livre.',
      'Se você e parceiros usam a ação padrão na mesma rodada, o dano de cada um é dividido pelo número de ações padrão.',
      'Kawarimi e ataque oportuno são compartilhados com o parceiro (1 para os dois).',
      'Montaria especial (grande ou maior): ela faz as defesas por você. Grau 3 de dano: Acrobacia (Dif 4 + ataque do inimigo) ou cai.',
      'Voando: atacar do chão corta o alcance pela metade; corpo a corpo só alcança quem voa com salto (Investida), Kinobori ou alcance maior.',
      'Cair do voo: dano fixo igual ao seu Vigor, e fica caído.',
    ],
  },
  {
    id: 'mochila',
    titulo: '🎒 Compartimentos e compras',
    pagina: 'págs. 126 e 140',
    linhas: [
      'Até 3 compartimentos cheios sem penalidade; cada um a mais: −3 m de deslocamento (mín. 10 m) e −1 nos testes de mobilidade, Força ou Agilidade.',
      'Bolsa com cinto dá 1 compartimento; mochila dá 4. Espadas e arcos ocupam 1 cada.',
      'Compre na ficha, aba Recursos › Itens e compras (os Ryos já descontam).',
    ],
  },
  {
    id: 'mesa',
    titulo: '🗺️ Usando a mesa',
    pagina: 'sistema',
    linhas: [
      'Toque no seu personagem para ver a ficha resumida; arraste para andar.',
      'No seu turno aparece o menu embaixo: Atacar, Mover, Jutsus e Outras.',
      'A defesa é escolhida por quem é atacado (aparece um aviso na tela).',
      '📍 Marcar: toque no mapa para chamar atenção, arraste para desenhar uma seta.',
      '🔊 Som e 🎵 Música: toque no botão para abrir o volume (vale só no seu aparelho).',
      '⚡ Modo leve: menos efeitos, para celular fraco.',
    ],
  },
];


/** Cartões só do Mestre (Livro Básico, págs. 279–288). */
const GUIA_MESTRE = [
  {
    id: 'gm_pdms',
    titulo: '🎭 Montar PdMs e capangas',
    pagina: 'págs. 280–281',
    linhas: [
      'Só precisam de ficha os inimigos, aliados importantes e quem mexe direto com os jogadores.',
      'PdM rápido: escolha o estilo e ponha o máximo nos atributos dele (Taijutsu: For, Agi, Vig · Ninjutsu: Des, Agi, Esp · Genjutsu: Int, Agi, Esp). Testes de perícia usam o atributo.',
      'Agilidade alta pede Reflexos; Percepção alta pede o efeito Barreira.',
      'Capanga: precisão de ataque e de defesa ≈ 3 + NC, dano ≈ NC − 3, 1 de Vitalidade.',
      'Capanga não faz crítico nem golpe de misericórdia contra não-capangas e falha em testes de atributo e perícia.',
      'Contra capanga, o jogador pode considerar o ataque 8 + precisão (ainda rola 2d8 para o grau).',
      'PdMs não resolvem enigmas nem salvam o grupo: os jogadores são os protagonistas.',
    ],
  },
  {
    id: 'gm_combates',
    titulo: '⚖️ Planejar combates',
    pagina: 'pág. 281',
    linhas: [
      'Decida quantas lutas haverá e quanto descanso cabe entre elas.',
      'Lutas antes do chefe: 1 capanga por jogador (até o dobro se o grupo tiver muito ataque em área).',
      'NC do chefe ≈ NC dos jogadores + número de jogadores, no máximo 4 acima deles.',
      'Capangas são o ajuste fino: ponha ou tire no meio da luta se estiver fácil ou difícil demais.',
    ],
  },
  {
    id: 'gm_tendencias',
    titulo: '🧭 Tendências',
    pagina: 'págs. 282–284',
    linhas: [
      'Dois eixos: Bem–Neutro–Mal e Leal–Neutro–Caótico, formando 9 tendências.',
      'Jogadores costumam ser Bondosos ou Neutros; vilões, Malignos.',
      'É um guia de comportamento, não uma prisão: atitudes contrárias acontecem, mas são raras.',
      'Animais e construtos não têm moral: são Neutros.',
    ],
  },
  {
    id: 'gm_missoes',
    titulo: '📜 Missões e recompensas',
    pagina: 'págs. 285–288',
    linhas: [
      'Valores para um time de 4; o bônus é por membro a menos.',
      'Rank D fora da vila ou do país conta como Rank C. Rank B em diante: só Chunnin e Jounin.',
      'Nukenins têm recompensa no Bingo Book conforme o nível deles.',
    ],
    tabela: [
      ['Rank D', 'custa 10.000 · cada ninja 100 Ryos (+10)'],
      ['Rank C', 'custa 20.000 · cada ninja 300 Ryos (+30)'],
      ['Rank B', 'custa 40.000 · cada ninja 600 Ryos (+60)'],
      ['Rank A', 'custa 80.000 · cada ninja 1.000 Ryos (+100)'],
      ['Rank S', 'custa 200.000+ · cada ninja 2.000 Ryos (+300)'],
    ],
  },
];

export default function TutorialPanel({ isGM = false }) {
  const [aberto, setAberto] = useState('testes');
  const lista = isGM ? [...GUIA, ...GUIA_MESTRE] : GUIA;

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      <p className="text-[11px] text-zinc-400">As regras que mais aparecem na mesa, em resumo. A página é do Livro Básico, para quem quiser o texto completo.</p>
      {lista.map((item) => {
        const open = aberto === item.id;
        return (
          <section key={item.id} className={`overflow-hidden rounded-lg border ${open ? 'border-orange-700/70 bg-zinc-950' : 'border-zinc-800 bg-zinc-950/60'}`}>
            <button type="button" onClick={() => setAberto(open ? null : item.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
              <span className="text-sm font-bold text-zinc-100">{item.titulo}{item.id.startsWith('gm_') && <span className="ml-1 rounded bg-orange-900/60 px-1 text-[9px] text-orange-200">só Mestre</span>}</span>
              <span className="shrink-0 text-[10px] text-zinc-500">{item.pagina} {open ? '▲' : '▼'}</span>
            </button>
            {open && (
              <div className="space-y-2 px-3 pb-3 text-xs text-zinc-300">
                <ul className="list-disc space-y-1 pl-4">{item.linhas.map((linha) => <li key={linha}>{linha}</li>)}</ul>
                {item.tabela && (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {item.tabela.map(([a, b]) => (
                        <tr key={a} className="border-t border-zinc-800">
                          <td className="py-1 pr-2 font-bold text-orange-200">{a}</td>
                          <td className="py-1 text-zinc-300">{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
