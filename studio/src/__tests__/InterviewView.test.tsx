// @vitest-environment jsdom

import { act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { InterviewView } from "../views/InterviewView";
import type { StudioOptions } from "../lib/api";

const apiState = vi.hoisted(() => ({
  startInterview: vi.fn(),
  sendInterviewMessage: vi.fn(),
  completeInterview: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    startInterview: apiState.startInterview,
    sendInterviewMessage: apiState.sendInterviewMessage,
    completeInterview: apiState.completeInterview,
  },
}));

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("InterviewView", () => {
  test("renders the welcome card and first question from mock API response", async () => {
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "What kind of project is this?", phase: 1, totalQuestions: 15 });
    apiState.sendInterviewMessage.mockResolvedValue({ message: "", phase: 1, questionIndex: 0, complete: false });

    render(<InterviewView options={mockOptions()} onOpenProject={() => undefined} />);

    expect(await screen.findByText("G.E.C.K. INITIALIZATION SEQUENCE")).toBeTruthy();
    expect(await screen.findByText("What kind of project is this?")).toBeTruthy();
  });

  test("submitting a message calls sendInterviewMessage and displays the response", async () => {
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "What kind of project is this?", phase: 1, totalQuestions: 15 });
    apiState.sendInterviewMessage.mockResolvedValue({ message: "What's your project called?", phase: 1, questionIndex: 1, complete: false });

    render(<InterviewView options={mockOptions()} onOpenProject={() => undefined} />);

    const input = await screen.findByLabelText("Interview answer");
    await userEvent.type(input, "TV series");
    await userEvent.click(screen.getByRole("button", { name: "Transmit →" }));

    await waitFor(() => expect(apiState.sendInterviewMessage).toHaveBeenCalledWith("sess-1", "TV series"));
    expect(await screen.findByText("What's your project called?")).toBeTruthy();
  });

  test("shows typing indicator while awaiting response", async () => {
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "What kind of project is this?", phase: 1, totalQuestions: 15 });
    let resolveTurn: ((value: { message: string; phase: number; questionIndex: number; complete: boolean }) => void) | undefined;
    apiState.sendInterviewMessage.mockImplementation(() => new Promise((resolve) => { resolveTurn = resolve; }));

    render(<InterviewView options={mockOptions()} onOpenProject={() => undefined} />);

    const input = await screen.findByLabelText("Interview answer");
    await userEvent.type(input, "TV series");
    await userEvent.click(screen.getByRole("button", { name: "Transmit →" }));

    expect(await screen.findByLabelText("Typing indicator")).toBeTruthy();

    await act(async () => resolveTurn?.({ message: "What's your project called?", phase: 2, questionIndex: 5, complete: false }));
  });

  test("phase progress bar advances when phase changes", async () => {
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "What kind of project is this?", phase: 1, totalQuestions: 15 });
    apiState.sendInterviewMessage.mockResolvedValue({ message: "Tell me about the world.", phase: 2, questionIndex: 5, complete: false });

    render(<InterviewView options={mockOptions()} onOpenProject={() => undefined} />);

    const input = await screen.findByLabelText("Interview answer");
    await userEvent.type(input, "TV series");
    await userEvent.click(screen.getByRole("button", { name: "Transmit →" }));

    await waitFor(() => expect(screen.getByText("Phase 2 of 4")).toBeTruthy());
  });

  test("shows completion card after complete response", async () => {
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "Final question", phase: 4, totalQuestions: 15 });
    apiState.sendInterviewMessage.mockResolvedValue({ message: "That gives me a strong foundation.", phase: "complete", questionIndex: 14, complete: true });
    apiState.completeInterview.mockImplementation(async (_sessionId: string, onEvent: (event: string, data: unknown) => void) => {
      onEvent("progress", { step: "generate" });
      onEvent("done", { slug: "signal-harbor", suggestionCount: 14, completenessScore: 72 });
    });

    render(<InterviewView options={mockOptions()} onOpenProject={() => undefined} />);

    const input = await screen.findByLabelText("Interview answer");
    await userEvent.type(input, "Found family and identity");
    await userEvent.click(screen.getByRole("button", { name: "Transmit →" }));

    expect(await screen.findByText("◈ INTERVIEW COMPLETE")).toBeTruthy();
  });

  test("Open Project link renders with correct slug after done event", async () => {
    const onOpenProject = vi.fn();
    apiState.startInterview.mockResolvedValue({ sessionId: "sess-1", message: "Final question", phase: 4, totalQuestions: 15 });
    apiState.sendInterviewMessage.mockResolvedValue({ message: "That gives me a strong foundation.", phase: "complete", questionIndex: 14, complete: true });
    apiState.completeInterview.mockImplementation(async (_sessionId: string, onEvent: (event: string, data: unknown) => void) => {
      onEvent("done", { slug: "signal-harbor", suggestionCount: 14, completenessScore: 72 });
    });

    render(<InterviewView options={mockOptions()} onOpenProject={onOpenProject} />);

    const input = await screen.findByLabelText("Interview answer");
    await userEvent.type(input, "Found family and identity");
    await userEvent.click(screen.getByRole("button", { name: "Transmit →" }));

    const button = await screen.findByRole("button", { name: "Open Project Dossier →" });
    await userEvent.click(button);

    expect(onOpenProject).toHaveBeenCalledWith("signal-harbor");
  });
});

function mockOptions(): StudioOptions {
  return {
    providers: [{ id: "openrouter", name: "OpenRouter", model: "google/gemini-2.5-flash-lite", available: true }],
    formats: ["tv_series"],
    packageTiers: ["light", "standard", "full"],
  };
}
