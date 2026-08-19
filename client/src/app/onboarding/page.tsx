import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="onboarding-page">
      <div className="emoji-cloud onboarding-emojis" aria-hidden="true">
        <span>🍅</span><span>🧀</span><span>🥬</span>
      </div>

      <header className="topbar floating-topbar">
        <Link className="brand brand-link" href="/"><span aria-hidden="true">●</span> MESA CERTA</Link>
        <p>ONBOARDING <span>/</span> RESTAURANTE</p>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">COMPRAS INTELIGENTES PARA RESTAURANTES</p>
          <h1 id="page-title">Vamos abastecer<br />sua melhor cozinha.</h1>
          <p className="lede">Cadastre os dados essenciais uma única vez. Depois, basta mandar um áudio no WhatsApp para comparar fornecedores.</p>
        </div>

        <div className="form-shell" aria-label="Cadastro do restaurante">
          <p className="mobile-form-intro">Cadastre seu restaurante em 3 passos</p>
          <OnboardingForm />
        </div>
      </section>
    </main>
  );
}
