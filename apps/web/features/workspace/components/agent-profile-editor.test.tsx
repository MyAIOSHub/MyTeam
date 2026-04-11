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
const mockGetAgentProfile = vi.fn()
const mockUpdateAgentProfile = vi.fn()
vi.mock("@/shared/api", () => ({
  api: {
    getAgentProfile: (...args: any[]) => mockGetAgentProfile(...args),
    updateAgentProfile: (...args: any[]) => mockUpdateAgentProfile(...args),
  },
}))

import { AgentProfileEditor } from "./agent-profile-editor"

describe("AgentProfileEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state then fetched profile", async () => {
    mockGetAgentProfile.mockResolvedValueOnce({
      display_name: "Claude Bot",
      avatar: "https://example.com/avatar.png",
      bio: "A helpful assistant",
      tags: ["backend", "python"],
    })

    render(<AgentProfileEditor agentId="agent-1" />)

    expect(screen.getByText("Loading...")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    expect(mockGetAgentProfile).toHaveBeenCalledWith("agent-1")

    const nameInput = screen.getByLabelText("Display name") as HTMLInputElement
    expect(nameInput.value).toBe("Claude Bot")

    const avatarInput = screen.getByLabelText("Avatar URL") as HTMLInputElement
    expect(avatarInput.value).toBe("https://example.com/avatar.png")

    const bioInput = screen.getByLabelText("Bio") as HTMLTextAreaElement
    expect(bioInput.value).toBe("A helpful assistant")

    const tagsInput = screen.getByLabelText("Tags") as HTMLInputElement
    expect(tagsInput.value).toBe("backend, python")
  })

  it("renders with defaults when fetch fails", async () => {
    mockGetAgentProfile.mockRejectedValueOnce(new Error("Not found"))

    render(<AgentProfileEditor agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText("Display name") as HTMLInputElement
    expect(nameInput.value).toBe("")
  })

  it("saves updated profile and shows success toast", async () => {
    mockGetAgentProfile.mockResolvedValueOnce({
      display_name: "Claude Bot",
      avatar: "",
      bio: "",
      tags: [],
    })
    mockUpdateAgentProfile.mockResolvedValueOnce({
      display_name: "Updated Bot",
      avatar: "",
      bio: "New bio",
      tags: ["senior"],
    })

    const user = userEvent.setup()
    render(<AgentProfileEditor agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText("Display name")
    await user.clear(nameInput)
    await user.type(nameInput, "Updated Bot")

    const bioInput = screen.getByLabelText("Bio")
    await user.type(bioInput, "New bio")

    const tagsInput = screen.getByLabelText("Tags")
    await user.type(tagsInput, "senior")

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith("agent-1", {
        display_name: "Updated Bot",
        avatar: undefined,
        bio: "New bio",
        tags: ["senior"],
      })
    })

    expect(mockToastSuccess).toHaveBeenCalledWith("Agent profile saved")
  })

  it("shows error toast when save fails", async () => {
    mockGetAgentProfile.mockResolvedValueOnce({
      display_name: "Claude Bot",
      avatar: "",
      bio: "",
      tags: [],
    })
    mockUpdateAgentProfile.mockRejectedValueOnce(new Error("Server error"))

    const user = userEvent.setup()
    render(<AgentProfileEditor agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Server error")
    })
  })

  it("parses comma-separated tags correctly", async () => {
    mockGetAgentProfile.mockResolvedValueOnce({
      display_name: "Bot",
      avatar: "",
      bio: "",
      tags: [],
    })
    mockUpdateAgentProfile.mockResolvedValueOnce({
      display_name: "Bot",
      tags: ["frontend", "react", "typescript"],
    })

    const user = userEvent.setup()
    render(<AgentProfileEditor agentId="agent-1" />)

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument()
    })

    const tagsInput = screen.getByLabelText("Tags")
    await user.type(tagsInput, "frontend, react, typescript")

    const saveButton = screen.getByRole("button", { name: "Save" })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateAgentProfile).toHaveBeenCalledWith("agent-1", expect.objectContaining({
        tags: ["frontend", "react", "typescript"],
      }))
    })
  })
})
