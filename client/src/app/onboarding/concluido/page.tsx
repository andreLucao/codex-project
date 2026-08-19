import Link from "next/link";
import QRCode from "qrcode";
import { createWhatsappLink, FIRST_QUOTE_MESSAGE } from "@/lib/whatsapp-link";

export default async function OnboardingCompletedPage() {
  const whatsappLink = createWhatsappLink();
  const qrCode = await QRCode.toDataURL(whatsappLink, {
    width: 320,
    margin: 2,
    color: { dark: "#0d2e27", light: "#fffaf0" },
  });

  return (
    <main className="completion-page">
      <div className="emoji-cloud completion-emojis" aria-hidden="true">
        <span>✨</span><span>🍅</span><span>🧀</span><span>🥬</span>
      </div>

      <header className="topbar floating-topbar completion-topbar">
        <Link className="brand brand-link" href="/"><span aria-hidden="true">●</span> MESA CERTA</Link>
        <Link className="header-cta" href="/">Voltar ao início <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="completion-content" aria-labelledby="completion-title">
        <div className="completion-copy">
          <p className="eyebrow">TUDO PRONTO</p>
          <h1 id="completion-title">Seu agente já está à mesa.</h1>
          <p>Escaneie o QR Code ou abra o WhatsApp diretamente para começar sua primeira cotação.</p>
        </div>

        <div className="whatsapp-card">
          <div className="qr-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} width="320" height="320" alt="QR Code para abrir uma conversa com a Mesa Certa no WhatsApp" />
          </div>
          <div className="whatsapp-details">
            <p className="eyebrow">PRIMEIRA COTAÇÃO</p>
            <h2>Chame a Mesa Certa</h2>
            <p>A mensagem já vai preenchida. Você poderá revisar tudo antes de enviar.</p>
            <blockquote>{FIRST_QUOTE_MESSAGE}</blockquote>
            <a className="whatsapp-button" href={whatsappLink} target="_blank" rel="noreferrer">
              Abrir conversa no WhatsApp <span aria-hidden="true">↗</span>
            </a>
            <a className="whatsapp-raw-link" href={whatsappLink} target="_blank" rel="noreferrer">wa.me/5511913912829</a>
          </div>
        </div>
      </section>
    </main>
  );
}
