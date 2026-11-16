---
name: computer-use
description: Inspect or operate Windows and macOS desktop apps in Pi, including reading screenshots and accessibility trees.
---

# Computer Use

Call `computer_use_<method>` directly. Use the live tool schemas for arguments and read the guide for the current platform.

- [Windows window selection and state](references/windows.md)
- [macOS app selectors and state](references/macos.md)

## Workflow

1. Get the app or window state. Use the screenshot or accessibility tree to identify the intended document, dialog or control. Resolve ambiguous targets before acting.
2. Take one state-dependent action at a time. Before typing or sending an editing shortcut, verify that the intended control has focus. If you click to set focus, check the result before typing.
3. Get fresh state after each action. Confirm the expected change before proceeding, and verify the requested outcome before reporting completion.

## Recovery and stopping

- Reacquire window references, element identifiers and coordinates after UI changes or when starting a new session.
- If an action times out or fails with an unknown outcome, inspect the UI before retrying. The action may already have taken effect.
- If an approval or request is denied, stop the affected operation and report the denial. On user cancellation, stop input. If the user asks to continue, start with fresh state.
- For missing tools or runtime errors, use `/computer-use-status` to help diagnose the installation.
