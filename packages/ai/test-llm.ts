import { createLLMProvider } from "./src/llm/factory";

async function test() {
  const provider = createLLMProvider({
    provider: "gemini", // Assuming GEMINI_API_KEY is in env
    model: "gemini-3-flash-preview"
  });

  try {
    const response = await provider.generate({
      prompt: "Hello, who are you?",
      systemInstruction: "You are a helpful assistant."
    });
    console.log("Response:", response.text);
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
