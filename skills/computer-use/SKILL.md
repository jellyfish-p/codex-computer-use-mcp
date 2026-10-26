---
name: computer-use
description: Operate Windows and macOS desktop apps with Computer Use. Use for desktop interaction, screenshot or accessibility-tree inspection, window selection, input focus, and recovery from stale targets or failed actions.
---

# Computer Use

Use the host platform's official tools through this adapter. Read only the matching guide before operating:

- Windows: [Window selection, input and recovery](references/windows.md).
- macOS: [App state, element identifiers and recovery](references/macos.md).

The live tool schemas are authoritative for available methods and arguments. These guides explain workflow, not a replacement API schema. Follow official approvals and the current session's rules.

## Observe → choose → act → verify

1. **Observe.** Locate the relevant app or window and request its current state. Continue when the screenshot or accessibility tree identifies the scene you intend to operate on.
2. **Choose.** Select a target from that observation using the user's goal. If several windows or controls remain plausible, resolve the ambiguity before acting; an app-name match alone is insufficient.
3. **Act.** Make one state-dependent action using the observed target. Before typing or sending an editing shortcut, confirm the intended editable region and input focus. If a click is needed to establish focus, inspect its result before entering text.
4. **Verify.** Request fresh state after the action. Continue only from the observed result, choosing a new target if the scene changed. A successful call alone does not establish that the user's goal was reached.
5. **Finish.** Report the verified outcome and any remaining uncertainty. Stop issuing input once the requested work is complete.

## Recovery and stopping

- If a call fails or times out and the action's outcome is unknown, observe before deciding whether to repeat it. The action may already have happened.
- If a dialog, navigation, window replacement or focus change appears, refresh state and select the next target from the new scene.
- Treat element identifiers, screenshot coordinates and window references as observations, not permanent handles. Reacquire them after a scene change or new official session, including recovery after cancellation or transport failure.
- Pi releases retained sessions when the agent settles or the session shuts down; cancellation or errors can also end them. Do not infer reference validity merely from a helper still running.
- When the user stops the task or presses Esc to cancel Computer Use, stop input. Resume only when the user asks to continue, beginning with a fresh observation.
- If official approval is declined or a request is denied, stop the affected operation and report it. Do not automatically retry or switch routes to bypass that decision.
- If tools or the official component are unavailable, explain the blocker; `/computer-use-status` can help the user inspect the installation. Tool activation remains the user's session configuration.

## Calling tools

Call `computer_use_<method>` directly when available. Direct calls require neither `node_repl`, an `@oai/sky` import, nor `codemode`; their results already include available screenshots.

Optional composition uses Pi's built-in `codemode`, a QuickJS sandbox rather than a Node runtime. Use `tools.computer_use_<method>(args)`, `text()` for text and `image()` for image blocks. Node imports are not available there.

A retained helper session is not persistent JavaScript execution. For small JSON values across codemode calls, use `store()` and `load()` rather than assuming local variables survive. Stored references still require the same freshness checks as direct calls. Keep state-dependent desktop actions sequential and return observations before deciding the next action.
