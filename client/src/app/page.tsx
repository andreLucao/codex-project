import Link from "next/link";

const benefits = [
  { icon: "voice", number: "01", title: "Peça por áudio", text: "Fale naturalmente no WhatsApp. O agente entende item, quantidade e prazo." },
  { icon: "compare", number: "02", title: "Compare fornecedores", text: "Várias conversas acontecem em paralelo enquanto você cuida do restaurante." },
  { icon: "quote", number: "03", title: "Receba tudo organizado", text: "Áudios, fotos e textos viram uma comparação simples para decidir rápido." },
];

const waveform = [10, 18, 28, 16, 34, 22, 12, 27, 38, 20, 31, 15, 25, 35, 18, 29, 13, 24, 32, 16, 22, 10];

export default function Home() {
  return (
    <main className="landing-page">
      <div className="emoji-cloud landing-emojis" aria-hidden="true">
        <span>🍅</span><span>🧀</span><span>🥬</span><span>🥖</span><span>🌶️</span>
      </div>

      <header className="topbar landing-topbar">
        <Link className="brand brand-link" href="/"><span aria-hidden="true">●</span> MESA CERTA</Link>
        <Link className="header-cta" href="/onboarding">Começar cadastro <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="eyebrow">SEU NOVO JEITO DE COMPRAR INSUMOS</p>
        <h1 id="landing-title">Você cozinha.<br /><em>A gente negocia.</em></h1>
        <p>Um agente que conversa com fornecedores, entende respostas bagunçadas e encontra a melhor cotação. Tudo a partir de um áudio.</p>
        <Link className="landing-cta" href="/onboarding">Cadastrar meu restaurante <span aria-hidden="true">→</span></Link>
        <div className="voice-note" role="img" aria-label="Exemplo de mensagem de voz: Preciso de 20 quilos de mussarela até quinta">
          <div className="voice-note-player">
            <span className="voice-play" aria-hidden="true">▶</span>
            <div className="voice-wave" aria-hidden="true">
              {waveform.map((height, index) => <i key={index} style={{ height }} />)}
            </div>
            <small>0:08</small>
          </div>
          <div className="voice-note-meta">
            <p>“Preciso de 20kg de mussarela até quinta.”</p>
            <time>10:42 ✓✓</time>
          </div>
        </div>
      </section>

      <section className="benefits" aria-labelledby="benefits-title">
        <div className="benefits-heading">
          <p className="eyebrow">DA MENSAGEM À MELHOR ESCOLHA</p>
          <h2 id="benefits-title">Três passos. Zero planilhas.</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.number}>
              <div>
                <svg className={`benefit-icon ${benefit.icon}`} viewBox="0 0 48 48" aria-hidden="true">
                  {benefit.icon === "voice" && <><rect x="17" y="7" width="14" height="24" rx="7" /><path d="M11 23c0 8 5 13 13 13s13-5 13-13M24 36v6M18 42h12" /></>}
                  {benefit.icon === "compare" && <><path d="M24 7v34M15 41h18M9 13h30M24 9 9 13M24 9l15 4M9 13 4 25M9 13l5 12M39 13l-5 12M39 13l5 12" /><path d="M4 25h10c0 4-2 7-5 7s-5-3-5-7ZM34 25h10c0 4-2 7-5 7s-5-3-5-7Z" /></>}
                  {benefit.icon === "quote" && <><path d="M9 10h30v28H9zM15 17h18M15 24h12M15 31h8" /><path d="m30 29 3 3 6-7" /></>}
                </svg>
                <small>{benefit.number}</small>
              </div>
              <h3>{benefit.title}</h3>
              <p>{benefit.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
