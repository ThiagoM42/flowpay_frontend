"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Assunto {
  id: number;
  nome: string;
  time_atendimento_id: number;
  ativo: boolean;
}

interface AtendimentoResponse {
  id: number;
  status: string;
  prioridade: string;
  descricao: string | null;
  criado_em: string;
  entrou_na_fila_em: string | null;
  iniciado_em: string | null;
  finalizado_em: string | null;
  cliente: {
    id: number;
    nome: string;
    email: string;
    telefone: string | null;
  };
  assunto: {
    id: number;
    nome: string;
  };
  time: {
    id: number;
    nome: string;
    slug: string;
  } | null;
  atribuicaoAtiva: {
    id: number;
    status: string;
    atendente: {
      id: number;
      nome: string;
      email: string;
    };
  } | null;
  eventos: Array<{
    id: number;
    tipo: string;
    descricao: string;
    criado_em: string;
  }>;
}

interface ValidationErrors {
  [field: string]: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_URL = "https://flowpay-backend-production-aw7fs6.laravel.cloud/api/v1";


const STATUS_MAP: Record<string, string> = {
  em_atendimento: "✅ Em atendimento",
  aguardando: "⏳ Aguardando atendente",
  concluido: "🏁 Concluído",
  encerrado: "🔒 Encerrado",
  cancelado: "❌ Cancelado",
};

const TERMINAL_STATUSES = new Set(["concluido", "encerrado", "cancelado"]);

const POLL_INTERVAL_MS = 2000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR");
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

const PRIORIDADE_MAP: Record<string, string> = {
  baixa: "🔵 Baixa",
  normal: "⚪ Normal",
  alta: "🟠 Alta",
  urgente: "🔴 Urgente",
};

function buildMarkdown(a: AtendimentoResponse): string {
  const status = STATUS_MAP[a.status] ?? a.status;
  const atendente = a.atribuicaoAtiva?.atendente.nome ?? "—";
  const telefone = a.cliente.telefone ?? "—";
  const prioridade = PRIORIDADE_MAP[a.prioridade] ?? a.prioridade;
  const time = a.time?.nome ?? "—";
  const iniciado = a.iniciado_em ? formatDate(a.iniciado_em) : "—";
  const finalizado = a.finalizado_em ? formatDate(a.finalizado_em) : "—";

  const rows = [
    `| Cliente   | ${a.cliente.nome} |`,
    `| E-mail    | ${a.cliente.email} |`,
    `| Telefone  | ${telefone} |`,
    `| Assunto   | ${a.assunto.nome} |`,
    `| Time      | ${time} |`,
    `| Atendente | ${atendente} |`,
    `| Prioridade| ${prioridade} |`,
    `| Criado em | ${formatDate(a.criado_em)} |`,
    `| Iniciado  | ${iniciado} |`,
    `| Finalizado| ${finalizado} |`,
  ];

  const lines = [
    `## Atendimento #${a.id}`,
    "",
    `**Status:** ${status}`,
    "",
    "| Campo     | Valor                  |",
    "|-----------|------------------------|",
    ...rows,
  ];

  if (a.eventos?.length > 0) {
    const ultimo = a.eventos[a.eventos.length - 1];
    lines.push("", `> 📋 ${ultimo.descricao}`);
  }

  return lines.join("\n");
}

// ─── Page ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { nome: "", email: "", telefone: "", assunto_id: "" };

export default function AtendimentosPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ValidationErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [atendimentos, setAtendimentos] = useState<AtendimentoResponse[]>([]);
  const [assuntos, setAssuntos] = useState<Assunto[]>([]);
  const [assuntosLoading, setAssuntosLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/assuntos`)
      .then((r) => r.json())
      .then((data: Assunto[]) => setAssuntos(data.filter((a) => a.ativo)))
      .catch(() => {})
      .finally(() => setAssuntosLoading(false));
  }, []);

  // Ref so the interval callback always sees the latest list without re-registering
  const atendimentosRef = useRef(atendimentos);
  useEffect(() => {
    atendimentosRef.current = atendimentos;
  });

  // Single polling loop — runs once on mount, cleans up on unmount
  useEffect(() => {
    const interval = setInterval(async () => {
      const active = atendimentosRef.current.filter((a) => !isTerminal(a.status));
      if (active.length === 0) return;

      await Promise.allSettled(
        active.map(async (a) => {
          try {
            const res = await fetch(
              `${BASE_URL}/atendimentos/${a.id}`
            );
            if (!res.ok) return;
            const updated: AtendimentoResponse = await res.json();
            setAtendimentos((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
          } catch {
            // network error — silently skip this tick
          }
        })
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        nome: form.nome,
        email: form.email,
        assunto_id: Number(form.assunto_id),
      };
      if (form.telefone.trim()) body.telefone = form.telefone.trim();

      const res = await fetch(`${BASE_URL}/atendimentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 201) {
        const data: AtendimentoResponse = await res.json();
        setAtendimentos((prev) => [data, ...prev]);
        setForm(EMPTY_FORM);

        // POST pode retornar atribuicaoAtiva null (atribuição assíncrona no backend).
        // GET imediato para já exibir o atendente sem aguardar o próximo ciclo de polling.
        try {
          const detail = await fetch(`${BASE_URL}/atendimentos/${data.id}`);
          if (detail.ok) {
            const full: AtendimentoResponse = await detail.json();
            setAtendimentos((prev) =>
              prev.map((p) => (p.id === full.id ? full : p))
            );
          }
        } catch {}

        return;
      }

      if (res.status === 422) {
        const data = await res.json();
        setFieldErrors(data.errors ?? {});
        return;
      }

      if (res.status === 503) {
        const data = await res.json();
        setGlobalError(
          data.error ?? "Serviço indisponível. Tente novamente em instantes."
        );
        return;
      }

      setGlobalError(`Erro inesperado (${res.status}). Tente novamente.`);
    } catch {
      setGlobalError(
        "Não foi possível conectar ao servidor. Verifique sua conexão."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Abrir atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">
            Preencha os dados abaixo para iniciar um novo atendimento.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5"
        >
          <Field label="Nome" required>
            <input
              type="text"
              name="nome"
              value={form.nome}
              onChange={handleChange}
              placeholder="João Silva"
              className={inputClass(!!fieldErrors.nome)}
            />
            <FieldError messages={fieldErrors.nome} />
          </Field>

          <Field label="E-mail" required>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="joao@email.com"
              className={inputClass(!!fieldErrors.email)}
            />
            <FieldError messages={fieldErrors.email} />
          </Field>

          <Field label="Telefone" hint="opcional">
            <input
              type="tel"
              name="telefone"
              value={form.telefone}
              onChange={handleChange}
              placeholder="11999999999"
              className={inputClass(!!fieldErrors.telefone)}
            />
            <FieldError messages={fieldErrors.telefone} />
          </Field>

          <Field label="Assunto" required>
            <select
              name="assunto_id"
              value={form.assunto_id}
              onChange={handleChange}
              className={inputClass(!!fieldErrors.assunto_id)}
            >
              <option value="">
                {assuntosLoading ? "Carregando…" : "Selecione um assunto"}
              </option>
              {assuntos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <FieldError messages={fieldErrors.assunto_id} />
          </Field>

          {globalError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {globalError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-xl py-2.5 text-sm transition-colors"
          >
            {loading ? "Abrindo atendimento…" : "Abrir atendimento"}
          </button>
        </form>

        {/* Atendimentos list */}
        {atendimentos.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                Atendimentos criados
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({atendimentos.length})
                </span>
              </h2>
              <button
                onClick={() => setAtendimentos([])}
                className="text-sm text-gray-500 hover:text-red-500 transition-colors"
              >
                Limpar lista
              </button>
            </div>

            {atendimentos.map((a) => {
              const live = !isTerminal(a.status);
              return (
                <article
                  key={a.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-5"
                >
                  {/* Live indicator + meta */}
                  <div className="flex items-start justify-between mb-4 gap-4">
                    {/* Left: polling status */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {live ? (
                        <>
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                          </span>
                          <span className="text-xs text-green-600 font-medium">
                            Atualizando em tempo real
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                          <span className="text-xs text-gray-400">Finalizado</span>
                        </>
                      )}
                    </div>

                    {/* Right: key fields at a glance */}
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs">
                      <span className="text-gray-400">
                        Atendente:{" "}
                        <span className="font-medium text-gray-700">
                          {a.atribuicaoAtiva?.atendente.nome ?? "—"}
                        </span>
                      </span>
                      {a.time && (
                        <span className="text-gray-400">
                          Time:{" "}
                          <span className="font-medium text-gray-700">{a.time.nome}</span>
                        </span>
                      )}
                      <span className="text-gray-400">
                        Prioridade:{" "}
                        <span className="font-medium text-gray-700">
                          {PRIORIDADE_MAP[a.prioridade] ?? a.prioridade}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Markdown content */}
                  <div className="prose prose-sm prose-gray max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {buildMarkdown(a)}
                    </ReactMarkdown>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="ml-1 text-gray-400 font-normal">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {messages.map((m, i) => (
        <li key={i} className="text-xs text-red-600">
          {m}
        </li>
      ))}
    </ul>
  );
}

function inputClass(hasError: boolean): string {
  return [
    "w-full rounded-lg border px-3 py-2 text-sm text-gray-900 outline-none transition-colors",
    "focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
    hasError
      ? "border-red-400 bg-red-50 focus:ring-red-400 focus:border-red-400"
      : "border-gray-300 bg-white",
  ].join(" ");
}
