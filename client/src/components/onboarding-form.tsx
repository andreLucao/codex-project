"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRestaurant, type FormState } from "@/app/actions";
import supplies from "@/data/supplies.json";
import { normalizeSupplyName } from "@/lib/supplies";
import { normalizeBrazilianWhatsapp } from "@/lib/whatsapp";

const initialState: FormState = { status: "idle", message: "" };

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createRestaurant, initialState);
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [values, setValues] = useState({ name: "", responsibleName: "", address: "", whatsapp: "" });
  const [selectedSupplies, setSelectedSupplies] = useState<string[]>([]);
  const [supplyQuery, setSupplyQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const supplyInputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = normalizeSupplyName(supplyQuery);
  const selectedKeys = new Set(selectedSupplies.map(normalizeSupplyName));
  const matches = supplies.filter((item) => !selectedKeys.has(normalizeSupplyName(item.name)) && normalizeSupplyName(item.name).includes(normalizedQuery));
  const hasExactMatch = matches.some((item) => normalizeSupplyName(item.name) === normalizedQuery);
  const supplyOptions = [
    ...matches.slice(0, hasExactMatch ? 6 : 5),
    ...(!hasExactMatch && supplyQuery.trim() ? [{ name: supplyQuery.trim(), category: "Item personalizado" }] : []),
  ];

  useEffect(() => {
    if (step > 0) titleRef.current?.focus();
  }, [step]);

  function nextStep() {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement>(`[data-step="${step}"] input`);
    if (fields && [...fields].every((field) => field.reportValidity())) {
      const next = step + 1;
      setFurthestStep((current) => Math.max(current, next));
      setStep(next);
    }
  }

  function setValue(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function addSupply(name: string) {
    const cleanName = name.trim();
    if (!cleanName || selectedKeys.has(normalizeSupplyName(cleanName))) return;
    setSelectedSupplies((current) => [...current, cleanName]);
    setSupplyQuery("");
    setActiveSuggestion(0);
    setShowSuggestions(false);
    supplyInputRef.current?.focus();
  }

  function handleSupplyKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && supplyOptions.length) {
      event.preventDefault();
      setShowSuggestions(true);
      setActiveSuggestion((current) => (current + 1) % supplyOptions.length);
    } else if (event.key === "ArrowUp" && supplyOptions.length) {
      event.preventDefault();
      setShowSuggestions(true);
      setActiveSuggestion((current) => (current - 1 + supplyOptions.length) % supplyOptions.length);
    } else if (event.key === "Enter" && supplyQuery.trim()) {
      event.preventDefault();
      addSupply(supplyOptions[activeSuggestion]?.name ?? supplyQuery);
    } else if (event.key === "Escape") {
      setShowSuggestions(false);
    } else if (event.key === "Backspace" && !supplyQuery && selectedSupplies.length) {
      setSelectedSupplies((current) => current.slice(0, -1));
    }
  }

  if (state.status === "success") {
    return (
      <div className="success-panel" role="status">
        <span className="success-mark" aria-hidden="true">✓</span>
        <p className="eyebrow">TUDO PRONTO</p>
        <h2>Seu restaurante entrou na mesa.</h2>
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction}>
      <div className="progress-heading" aria-label={`Etapa ${step + 1} de 3`}>
        <span>0{step + 1}</span><span>/</span><span>03</span>
      </div>
      <nav className="progress-track" aria-label="Etapas do cadastro">
        {[0, 1, 2].map((item) => (
          <button
            type="button"
            key={item}
            className={item <= step ? "complete" : ""}
            disabled={item > furthestStep}
            aria-current={item === step ? "step" : undefined}
            aria-label={`Ir para etapa ${item + 1}`}
            onClick={() => setStep(item)}
          />
        ))}
      </nav>

      <fieldset className="form-step" data-step="0" hidden={step !== 0}>
        <div className="step-heading">
          <p className="eyebrow">SOBRE O NEGÓCIO</p>
          <h2 ref={step === 0 ? titleRef : undefined} tabIndex={-1}>Primeiro, sua cozinha.</h2>
          <p>Comece pelo básico para o agente saber com quem está falando.</p>
        </div>
        <label>
          Nome do restaurante
          <input name="name" type="text" autoComplete="organization" placeholder="Ex.: Cantina do Bairro" required maxLength={120} value={values.name} onChange={(event) => setValue("name", event.target.value)} />
        </label>
        <label>
          Nome do responsável
          <input name="responsibleName" type="text" autoComplete="name" placeholder="Seu nome completo" required maxLength={120} value={values.responsibleName} onChange={(event) => setValue("responsibleName", event.target.value)} />
        </label>
        <button className="primary-button" type="button" onClick={nextStep}>Continuar <span aria-hidden="true">→</span></button>
      </fieldset>

      <fieldset className="form-step" data-step="1" hidden={step !== 1}>
        <div className="step-heading">
          <p className="eyebrow">LOCALIZAÇÃO E CONTATO</p>
          <h2 ref={step === 1 ? titleRef : undefined} tabIndex={-1}>Onde encontramos você?</h2>
          <p>O endereço encontra fornecedores. O WhatsApp mantém a conversa andando.</p>
        </div>
        <label>
          Endereço completo
          <input name="address" type="text" autoComplete="street-address" placeholder="Rua, número, bairro e cidade" required maxLength={300} value={values.address} onChange={(event) => setValue("address", event.target.value)} />
          <small>Usaremos este endereço para localizar fornecedores próximos.</small>
        </label>
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+5511999999999"
            required
            value={values.whatsapp}
            onChange={(event) => setValue("whatsapp", event.target.value)}
            onBlur={(event) => {
              const normalized = normalizeBrazilianWhatsapp(event.currentTarget.value);
              if (normalized) setValue("whatsapp", normalized);
            }}
          />
          <small>Inclua o código do país (+55) e o DDD.</small>
        </label>
        <div className="form-actions">
          <button className="back-button" type="button" onClick={() => setStep(0)}>← Voltar</button>
          <button className="primary-button" type="button" onClick={nextStep}>Continuar <span aria-hidden="true">→</span></button>
        </div>
      </fieldset>

      <fieldset className="form-step" data-step="2" hidden={step !== 2}>
        <div className="step-heading">
          <p className="eyebrow">ÚLTIMO DETALHE</p>
          <h2 ref={step === 2 ? titleRef : undefined} tabIndex={-1}>O que não pode faltar?</h2>
          <p>Conte o que costuma comprar. Você poderá pedir qualquer outro item depois.</p>
        </div>
        <div className="supply-field" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setShowSuggestions(false);
        }}>
          <label htmlFor="supply-search"><span>Insumos frequentes <span className="optional">OPCIONAL</span></span></label>
          {selectedSupplies.length > 0 && (
            <div className="supply-chips" aria-label="Insumos selecionados">
              {selectedSupplies.map((supply) => (
                <span className="supply-chip" key={supply}>
                  {supply}
                  <button type="button" aria-label={`Remover ${supply}`} onClick={() => setSelectedSupplies((current) => current.filter((item) => item !== supply))}>×</button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={supplyInputRef}
            id="supply-search"
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls="supply-suggestions"
            aria-activedescendant={showSuggestions && supplyOptions.length ? `supply-option-${activeSuggestion}` : undefined}
            placeholder="Busque por mussarela, tomate, farinha…"
            value={supplyQuery}
            onFocus={() => setShowSuggestions(true)}
            onChange={(event) => { setSupplyQuery(event.target.value); setActiveSuggestion(0); setShowSuggestions(true); }}
            onKeyDown={handleSupplyKeyDown}
          />
          <input type="hidden" name="frequentSupplies" value={selectedSupplies.join(",")} />
          {showSuggestions && supplyOptions.length > 0 && (
            <div className="supply-suggestions" id="supply-suggestions" role="listbox">
              {supplyOptions.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  id={`supply-option-${index}`}
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? "active" : ""}
                  key={`${item.category}-${item.name}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addSupply(item.name)}
                >
                  <span>{item.name}</span><small>{item.category}</small>
                </button>
              ))}
            </div>
          )}
          <small>Escolha uma sugestão ou pressione Enter para adicionar um item personalizado.</small>
        </div>
        <div className="demo-note"><span aria-hidden="true">✦</span><p>Depois do cadastro, seu próximo pedido começa com um simples áudio no WhatsApp.</p></div>
        <div className="form-actions">
          <button className="back-button" type="button" onClick={() => setStep(1)}>← Voltar</button>
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Cadastrar restaurante"}<span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className={`feedback ${state.status}`} role="status" aria-live="polite">{state.message}</p>
      </fieldset>
    </form>
  );
}
