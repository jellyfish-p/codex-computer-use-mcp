# Windows Computer Use

Use this guide on Windows with the shared [observe–act–verify workflow](../SKILL.md). The platform exposes thirteen `computer_use_*` tools. Names below omit that prefix where convenient; consult the live schema for full arguments.

## Locate the intended window

1. Call `computer_use_list_apps({})` for installed apps and their open windows, or `computer_use_list_windows({})` for targetable open windows.
2. Match the user's goal against app identity, window title and observed content. When multiple documents match, inspect candidates or ask which one the user means rather than taking the first window.
3. Copy a returned window object unchanged into subsequent `window` arguments, including any additional fields. Preserve its `app` selector; do not reconstruct it from a title or impose a same-app restriction when the task moves to another app.
4. If the intended app has no window, use `launch_app({ app })` with its listed app id, then list again and select the actual returned window.

Structured results are `{ apps }` from `list_apps`, `{ windows }` from `list_windows`, and `{ window }` from `get_window`. App entries may have a `windows` array; it can be absent or empty.

If only the local window binding was lost, `get_window({ id, app })` can rehydrate a still-open window using its previously returned id and optional app selector. Inspect the returned window before acting. If it was closed or replaced, list windows again instead of recycling the old id.

## Observe and select

Call `get_window_state` with the selected window. Screenshots are enabled by default; request `include_text: true` for the indexed accessibility tree.

Direct-call argument example, where `window` denotes the complete object just returned:

```text
computer_use_get_window_state({ window, include_text: true })
```

The structured state is `{ window, accessibility, screenshots }`. Read `accessibility.tree` when present, and use focus information such as `accessibility.focused_element` when available. Each `screenshots[]` entry carries an `id` and an `image` block or null. Direct tool results already display available images; optional codemode scripts can emit each non-null `state.screenshots[].image` through `image()`.

Choose an `element_index` only from the latest tree. For coordinate actions, use the latest screenshot and window-relative coordinates; carry its id as `screenshotId` when supported. Reobserve after layout changes, scrolling or window movement instead of transferring coordinates from an old scene.

## Input and focus

Input methods activate their target window automatically. `activate_window({ window })` explicitly brings a window forward when needed, but activating a window does not prove an editor has focus. Inspect after activation or a focus-setting click, confirm the intended editable region, then type.

Choose the method that matches the observed control:

| Method | Use |
| --- | --- |
| `click` | Pass `window` and a current `element_index`, or screenshot-grounded `x`, `y`. |
| `type_text` | Pass `window`, `text` to type literal text at the confirmed focus. |
| `press_key` | Pass `window`, `key`; use keysyms such as `Return`, `Tab` or `Control_L+a`. |
| `set_value` | Pass `window`, `element_index`, `value` to replace a known editable element's value. |
| `scroll` | Pass `window`, start `x`, `y`, and `scrollX`, `scrollY`; negative deltas scroll left or up. |
| `drag` | Pass `window`, `from_x`, `from_y`, `to_x`, `to_y` from the current scene. |
| `perform_secondary_action` | Pass `window`, `element_index`, and an `action` label exposed by the current tree. |

Request `get_window_state` after each state-dependent action. Check the resulting focus, text or visual change before continuing.

## Recover the scene

- A modal may change the actionable surface. Refresh state; if it is a separate window, list windows and select that returned object. Verify which dialog or editor will receive input.
- For a stale element or missing window, obtain fresh state or a new window object before choosing another target. Repeatedly sending the old arguments does not recover them.
- After an unknown action result, inspect whether it already completed before retrying, especially for typing, submission or toggles.
- The official helper can hold the desktop during a turn. Esc cancels it: stop input and follow the shared stopping rules.
- Pi does not end a working session merely because there have been 15 seconds without Computer Use calls. MCP has a separate default 15-second idle-turn fallback. Neither retained sessions nor short pauses guarantee that UI references remain current.
