import { NextRequest, NextResponse } from "next/server";

// Stub questions for UI development — swap for real Claude call when backend is ready
const SAMPLE_QUESTIONS = [
  "What's a memory from your childhood that still makes you smile?",
  "What did you want to be when you were young?",
  "What's the hardest thing you've ever had to learn?",
  "Who taught you the most important lesson of your life?",
  "What does home mean to you?",
  "What are you most proud of that nobody knows about?",
  "What would you tell your younger self?",
  "What has surprised you most about getting older?",
];

export async function POST(_req: NextRequest) {
  // TODO: replace with real Anthropic SDK call once @anthropic-ai/sdk is installed
  const question =
    SAMPLE_QUESTIONS[Math.floor(Math.random() * SAMPLE_QUESTIONS.length)];

  // Simulate a small thinking delay
  await new Promise((r) => setTimeout(r, 1200));

  return NextResponse.json({ question });
}
