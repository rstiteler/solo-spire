import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "GEMINI_API_KEY must be set. Get a free key at https://aistudio.google.com/app/apikey",
  );
}

export const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
