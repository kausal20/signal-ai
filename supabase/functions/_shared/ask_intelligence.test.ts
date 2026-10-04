
Deno.test("isSmallTalk: greetings and thanks skip retrieval; real questions don't", async () => {
  const { isSmallTalk } = await import("./ask_intelligence.ts");
  for (const q of ["hi", "Hi!", "hii", "hello", "hey signal", "good morning", "thanks", "thank you!", "who are you?", "what can you do", "ok"]) {
    if (!isSmallTalk(q)) throw new Error(`expected small talk: ${q}`);
  }
  for (const q of ["hi, what's new with OpenAI?", "what is aws", "help me compare Claude and Gemini", "latest AI news", "how do MCP servers work?"]) {
    if (isSmallTalk(q)) throw new Error(`expected real question: ${q}`);
  }
});
