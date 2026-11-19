// =====================================================================
// Modificador de voz (PLANEJAMENTO-IA seção 13)
//
// O microfone passa por um "caminho de efeitos" no navegador ANTES de ir
// para a chamada (Web Audio). Quem ouve recebe a voz já modificada: não pesa
// para ninguém além de quem fala, e não precisa de IA nem do PC servidor.
//
//   microfone → [efeito de voz] → [efeito do mapa] → chamada
//
// Trocar de efeito só religa os nós: a faixa enviada é sempre a mesma,
// então a chamada não precisa reconectar.
// =====================================================================

/** Efeitos de voz (lista aprovada). */
export const EFEITOS_VOZ = [
  { id: 'normal', label: 'Normal', icone: '🙂' },
  { id: 'grave', label: 'Grave', icone: '🧔', dica: 'Mais grossa (ex.: velho)' },
  { id: 'aguda', label: 'Aguda', icone: '👧', dica: 'Mais fina' },
  { id: 'robo', label: 'Robô', icone: '🤖' },
  { id: 'eco', label: 'Eco', icone: '🕳️', dica: 'Eco / caverna' },
  { id: 'radio', label: 'Rádio', icone: '📻' },
  { id: 'sussurro', label: 'Sussurro', icone: '🤫' },
  { id: 'monstro', label: 'Monstro', icone: '👹' },
];

/** Efeitos de ambiente por mapa (exemplos aprovados). */
export const EFEITOS_MAPA = [
  { id: '', label: 'Nenhum' },
  { id: 'caverna', label: 'Caverna (eco)' },
  { id: 'agua', label: 'Debaixo d\'água (abafada)' },
];

// Processadores que rodam fora da tela (AudioWorklet): mudar o tom e sussurro.
const WORKLET = `
class MudarTom extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'razao', defaultValue: 1, minValue: 0.25, maxValue: 4 }]; }
  constructor() {
    super();
    this.tam = 4096; this.buf = new Float32Array(this.tam); this.w = 0;
    this.janela = 1200; this.fase = 0;
  }
  ler(atraso) {
    let p = this.w - atraso; while (p < 0) p += this.tam;
    const i = Math.floor(p), f = p - i;
    return this.buf[i % this.tam] * (1 - f) + this.buf[(i + 1) % this.tam] * f;
  }
  process(inputs, outputs, params) {
    const ent = inputs[0][0], sai = outputs[0][0];
    if (!sai) return true;
    const razao = params.razao[0];
    const passo = (1 - razao) / this.janela;
    for (let n = 0; n < sai.length; n += 1) {
      this.buf[this.w] = ent ? ent[n] : 0;
      this.fase += passo; if (this.fase >= 1) this.fase -= 1; if (this.fase < 0) this.fase += 1;
      const f2 = (this.fase + 0.5) % 1;
      const a = this.ler(this.fase * this.janela + 1) * Math.sin(Math.PI * this.fase);
      const b = this.ler(f2 * this.janela + 1) * Math.sin(Math.PI * f2);
      sai[n] = a + b;
      this.w = (this.w + 1) % this.tam;
    }
    for (let c = 1; c < outputs[0].length; c += 1) outputs[0][c].set(sai);
    return true;
  }
}
class Sussurro extends AudioWorkletProcessor {
  constructor() { super(); this.env = 0; }
  process(inputs, outputs) {
    const ent = inputs[0][0], sai = outputs[0][0];
    if (!sai) return true;
    for (let n = 0; n < sai.length; n += 1) {
      const x = ent ? ent[n] : 0;
      const a = Math.abs(x);
      this.env = a > this.env ? this.env * 0.9 + a * 0.1 : this.env * 0.9995;
      sai[n] = (Math.random() * 2 - 1) * this.env * 1.6 + x * 0.25;
    }
    for (let c = 1; c < outputs[0].length; c += 1) outputs[0][c].set(sai);
    return true;
  }
}
registerProcessor('mudar-tom', MudarTom);
registerProcessor('sussurro', Sussurro);
`;

/** Resposta de sala gerada por código (ruído que vai sumindo): eco sem baixar arquivo. */
function impulso(ctx, segundos, queda) {
  const len = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** queda;
  }
  return buf;
}

function curvaDistorcao(k) {
  const n = 1024; const curva = new Float32Array(n);
  for (let i = 0; i < n; i += 1) { const x = (i * 2) / n - 1; curva[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x)); }
  return curva;
}

export class VozProcessador {
  constructor(microfone) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.fonte = this.ctx.createMediaStreamSource(microfone);
    this.saida = this.ctx.createMediaStreamDestination();
    this.track = this.saida.stream.getAudioTracks()[0];
    this.nos = [];
    this.temWorklet = false;
    this.estado = { voz: 'normal', ambiente: '' };
    this.pronto = this.carregarWorklet().then(() => this.montar());
    this.fonte.connect(this.saida); // até carregar, passa a voz normal
  }

  async carregarWorklet() {
    try {
      if (!this.ctx.audioWorklet) return;
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.temWorklet = true;
    } catch (e) {
      console.warn('Efeitos de tom indisponíveis neste navegador:', e);
    }
  }

  /** Troca os efeitos: { voz: 'grave'…, ambiente: 'caverna'|'agua'|'' }. */
  definir(estado) {
    this.estado = { ...this.estado, ...estado };
    this.pronto.then(() => this.montar());
  }

  limpar() {
    try { this.fonte.disconnect(); } catch { /* já solto */ }
    this.nos.forEach((no) => { try { no.disconnect(); } catch { /* já solto */ } try { no.stop?.(); } catch { /* sem stop */ } });
    this.nos = [];
  }

  /** Liga: fonte → voz → ambiente → saída. */
  montar() {
    if (this.ctx.state === 'closed') return;
    this.limpar();
    const { voz, ambiente } = this.estado;
    let ponta = this.fonte;
    ponta = this.efeitoVoz(ponta, voz);
    // Somar efeitos: com efeito de voz junto, o do mapa entra mais suave para não atrapalhar o entendimento.
    ponta = this.efeitoAmbiente(ponta, ambiente, voz && voz !== 'normal');
    ponta.connect(this.saida);
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  guardar(no) { this.nos.push(no); return no; }
  filtro(tipo, freq, q = 0.7, ganho = 0) {
    const f = this.guardar(this.ctx.createBiquadFilter());
    f.type = tipo; f.frequency.value = freq; f.Q.value = q; f.gain.value = ganho;
    return f;
  }
  ganho(v) { const g = this.guardar(this.ctx.createGain()); g.gain.value = v; return g; }
  tom(razao) {
    if (!this.temWorklet) return null;
    const no = this.guardar(new AudioWorkletNode(this.ctx, 'mudar-tom', { outputChannelCount: [1] }));
    no.parameters.get('razao').value = razao;
    return no;
  }
  /** Mistura "seco + molhado" (eco/reverberação). */
  reverb(entrada, segundos, queda, molhado) {
    const conv = this.guardar(this.ctx.createConvolver());
    conv.buffer = impulso(this.ctx, segundos, queda);
    const seco = this.ganho(1);
    const mol = this.ganho(molhado);
    const soma = this.ganho(1);
    entrada.connect(seco).connect(soma);
    entrada.connect(conv).connect(mol).connect(soma);
    return soma;
  }

  efeitoVoz(entrada, voz) {
    const ctx = this.ctx;
    switch (voz) {
      case 'grave': {
        const t = this.tom(0.78);
        if (!t) return entrada.connect(this.filtro('lowshelf', 250, 0.7, 6));
        return entrada.connect(t).connect(this.filtro('lowshelf', 200, 0.7, 3));
      }
      case 'aguda': {
        const t = this.tom(1.35);
        return t ? entrada.connect(t) : entrada.connect(this.filtro('highshelf', 2500, 0.7, 6));
      }
      case 'monstro': {
        const t = this.tom(0.6);
        const dist = this.guardar(ctx.createWaveShaper());
        dist.curve = curvaDistorcao(30);
        const base = t ? entrada.connect(t) : entrada;
        return base.connect(dist).connect(this.filtro('lowshelf', 180, 0.7, 8)).connect(this.ganho(0.8));
      }
      case 'robo': {
        // Modulação em anel: a voz multiplicada por uma onda de 50 Hz.
        const osc = this.guardar(ctx.createOscillator());
        osc.frequency.value = 50; osc.type = 'square';
        const anel = this.ganho(0);
        osc.connect(anel.gain);
        osc.start();
        return entrada.connect(anel).connect(this.filtro('bandpass', 1200, 0.6)).connect(this.ganho(2.2));
      }
      case 'eco': {
        const atraso = this.guardar(ctx.createDelay(1));
        atraso.delayTime.value = 0.28;
        const volta = this.ganho(0.4);
        const soma = this.ganho(1);
        entrada.connect(soma);
        entrada.connect(atraso); atraso.connect(volta).connect(atraso); atraso.connect(soma);
        return this.reverb(soma, 1.8, 3, 0.5);
      }
      case 'radio': {
        const dist = this.guardar(ctx.createWaveShaper());
        dist.curve = curvaDistorcao(12);
        return entrada.connect(this.filtro('highpass', 400)).connect(this.filtro('lowpass', 3000)).connect(dist).connect(this.ganho(0.9));
      }
      case 'sussurro': {
        if (!this.temWorklet) return entrada.connect(this.filtro('highpass', 1500)).connect(this.ganho(0.6));
        const s = this.guardar(new AudioWorkletNode(ctx, 'sussurro', { outputChannelCount: [1] }));
        return entrada.connect(s).connect(this.filtro('bandpass', 2500, 0.5)).connect(this.ganho(1.4));
      }
      default:
        return entrada;
    }
  }

  efeitoAmbiente(entrada, ambiente, suave) {
    if (ambiente === 'caverna') return this.reverb(entrada, suave ? 1.4 : 2.6, 2.5, suave ? 0.35 : 0.7);
    if (ambiente === 'agua') return entrada.connect(this.filtro('lowpass', suave ? 900 : 550, 1.2)).connect(this.ganho(1.3));
    return entrada;
  }

  fechar() {
    this.limpar();
    try { this.ctx.close(); } catch { /* já fechado */ }
  }
}
