import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock sonner
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}))

// Mock api
const mockGetAgentAutoReply = vi.fn()
const mockUpdateAgentAutoReply = vi.fn()
vi.mock("@/shared/api", () => ({
  api: {
    getAgentAutoReply: (...args: any[]) => mockGetAgentAutoReply(...args),
    updateAgentAutoReply: (...args: any[]) => mockUpdateAgentAutoReply(...args),
  },
}))

import { AgentAutoReplyConfig } from "./agent-auto-reply-config"

describe("AgentAutoReplyConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state then fetched config", async () => {
    mockGetAgentAutoReply.mockResolvedValueOnce({
      enabled: true,
      model: "claude-sonnet-4-20250514",
      system_prompt: "Be helpful",
    })

    render(<AgentAutoReplyConfig agentId="agent-1" />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    expect(mockGetAgentAutoReply).toHaveBeenCalledWith("agent-1")

    const modelInput = screen.getByLabelText("Model") as HTMLInputElement
    expect(modelInput.value).toBe("claude-sonnet-4-20250514")

    const promptInput = screen.getByLabelText("System prompt") as HTMLTextAreaElement
    expect(promptInput.value).toBe("Be helpful")
  })

  it("renders with defaults when fetch fails", async () => {
    mockGetAgentAutoReply.mockRejectedValueOnce(new Error("Not found"))

    render(<AgentAutoReplyConfig agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const modelInput = screen.getByLabelText("Model") as HTMLInputElement
    expect(modelInput.value).toBe("")
  })

  it("saves updated config and shows success toast", async () => {
    mockGetAgentAutoReply.mockResolvedValueOnce({
      enabled: false,
      model: "",
      system_prompt: "",
    })
    mockUpdateAgentAutoReply.mockResolvedValueOnce({
      enabled: false,
      model: "gpt-4",
      system_prompt: "",
    })

    const user = userEvent.setup()
    render(<AgentAutoReplyConfig agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const modelInput = screen.getByLabelText("Model")
    await user.clear(modelInput)
    await user.type(modelInput, "gpt-4")

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateAgentAutoReply).toHaveBeenCalledWith("agent-1", {
        enabled: false,
        model: "gpt-4",
        system_prompt: undefined,
      })
    })

    expect(mockToastSuccess).toHaveBeenCalledWith("Auto-reply settings saved")
  })

  it("shows error toast when save fails", async () => {
    mockGetAgentAutoReply.mockResolvedValueOnce({
      enabled: false,
      model: "",
      system_prompt: "",
    })
    mockUpdateAgentAutoReply.mockRejectedValueOnce(new Error("Server error"))

    const user = userEvent.setup()
    render(<AgentAutoReplyConfig agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server error")
    })
  })
})
