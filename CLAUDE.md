# CLAUDE.md

## Project

mymentos — a hackathon mockup. An AI-facilitated conversation aid for intergenerational dialogue (e.g. grandchild talking with grandparent). The app listens to the conversation and surfaces prompts, questions, and context to enrich the exchange.

## Stack

- Next.js 15, App Router, TypeScript, Tailwind CSS
- Claude API (Anthropic) for AI features

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

## Conventions

- All UI in `app/` using App Router file conventions
- Use Tailwind utility classes — no separate CSS files unless necessary
- Keep components in `app/components/` if they are reused
- API routes go in `app/api/`
- Use `fetch` with Next.js route handlers for any Claude API calls (never expose API key client-side)

## AI Integration

- Claude API key lives in `.env.local` as `ANTHROPIC_API_KEY`
- Use the Anthropic SDK (`npm install @anthropic-ai/sdk`)
- AI calls should go through a Next.js route handler (`app/api/...`) not directly in client components

## Scope

This is a hackathon mockup — prioritize working UI and demo-ability over robustness, error handling, or scalability.
