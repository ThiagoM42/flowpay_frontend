# FlowPay — Atendimentos

Interface web para abertura e acompanhamento de atendimentos em tempo real.

## O que faz

- Formulário para abrir um novo atendimento (nome, e-mail, telefone, assunto)
- Exibe os atendimentos criados em cards com status, atendente, time e prioridade
- Atualiza cada card automaticamente a cada 2 segundos enquanto o atendimento estiver em aberto
- Para de atualizar quando o atendimento é concluído, encerrado ou cancelado

## Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **react-markdown** + **remark-gfm** — renderiza o conteúdo dos cards em markdown com tabelas

## Como rodar

```bash
npm install
npm run dev
```

Acesse [https://flowpay-frontend-rjzhpdcan-thiagom42s-projects.vercel.app/](https://flowpay-frontend-rjzhpdcan-thiagom42s-projects.vercel.app/).

## API

Aponta para `BASE_URL` definido em `src/app/page.tsx`. Por padrão usa o ambiente de produção do backend. Para desenvolvimento local, troque para `http://localhost:8000/api/v1`.
