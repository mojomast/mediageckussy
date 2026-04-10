import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const openAIState = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

const anthropicState = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
}));

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = { completions: { create: openAIState.create } };
      models = { list: openAIState.list };
      constructor(_: unknown) {}
    },
  };
});

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = { create: anthropicState.create };
      models = { list: anthropicState.list };
      constructor(_: unknown) {}
    },
  };
});

describe("AI providers", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    openAIState.create.mockReset();
    openAIState.list.mockReset();
    anthropicState.create.mockReset();
    anthropicState.list.mockReset();
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = { ...env };
  });

  test("MockLLMProvider returns responses in order and cycles", async () => {
    const { MockLLMProvider } = await import("../../ai/providers/index.js");
    const provider = new MockLLMProvider(["first", "second"]);

    await expect(provider.complete({ system: "s", user: "u" })).resolves.toMatchObject({ content: "first" });
    await expect(provider.complete({ system: "s", user: "u" })).resolves.toMatchObject({ content: "second" });
    await expect(provider.complete({ system: "s", user: "u" })).resolves.toMatchObject({ content: "first" });
  });

  test("resolveProvider('openai') throws if key env var is not set", async () => {
    delete process.env.MEDIAGECKUSSY_OPENAI_API_KEY;
    const { resolveProvider } = await import("../../ai/providers/index.js");

    expect(() => resolveProvider("openai")).toThrow(/MEDIAGECKUSSY_OPENAI_API_KEY/);
  });

  test("resolveProvider('unknown') throws a descriptive error", async () => {
    const { resolveProvider } = await import("../../ai/providers/index.js");

    expect(() => resolveProvider("unknown")).toThrow(/Unknown LLM provider "unknown"/);
  });

  test("OpenAIProvider.complete returns a normalized CompletionResponse", async () => {
    process.env.MEDIAGECKUSSY_OPENAI_API_KEY = "test-key";
    openAIState.create.mockResolvedValue({
      model: "gpt-4o-mini",
      choices: [{ message: { content: "hello from openai" } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
      },
    });

    const { OpenAIProvider } = await import("../../ai/providers/openai.js");
    const provider = new OpenAIProvider();
    const response = await provider.complete({ system: "sys", user: "usr", responseFormat: "json" });

    expect(response).toMatchObject({
      content: "hello from openai",
      model: "gpt-4o-mini",
      usage: {
        promptTokens: 12,
        completionTokens: 34,
      },
    });
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("AnthropicProvider.complete returns a normalized CompletionResponse", async () => {
    process.env.MEDIAGECKUSSY_ANTHROPIC_API_KEY = "test-key";
    anthropicState.create.mockResolvedValue({
      model: "claude-haiku-3-5",
      content: [{ type: "text", text: "hello from anthropic" }],
      usage: {
        input_tokens: 21,
        output_tokens: 43,
      },
    });

    const { AnthropicProvider } = await import("../../ai/providers/anthropic.js");
    const provider = new AnthropicProvider();
    const response = await provider.complete({ system: "sys", user: "usr" });

    expect(response).toMatchObject({
      content: "hello from anthropic",
      model: "claude-haiku-3-5",
      usage: {
        promptTokens: 21,
        completionTokens: 43,
      },
    });
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });
});
