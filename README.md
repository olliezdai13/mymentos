# mymentos

Enhancing intergenerational knowledge sharing through AI-facilitated conversation.

mymentos listens to conversations between younger and older generations, then uses AI to surface questions, context, and prompts that deepen the exchange — helping grandchildren learn from grandparents and vice versa.

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Claude API** — AI conversation facilitation

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  page.tsx        # Main conversation UI
  layout.tsx      # Root layout
  globals.css     # Global styles
public/           # Static assets
```

## Environment Variables

Create a `.env.local` file:

```
ANTHROPIC_API_KEY=your_key_here
```

## Hackathon Notes

This is a mockup. Focus is on the UI/UX of the conversation facilitation experience, not production infrastructure.
