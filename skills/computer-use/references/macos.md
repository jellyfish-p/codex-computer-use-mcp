# macOS Computer Use

Use this guide on macOS with the shared [observe–act–verify workflow](../SKILL.md). The platform exposes ten `computer_use_*` tools. Names below omit that prefix where convenient; consult the live schema for full arguments.

## Identify and observe the app

Use `computer_use_list_apps({})` when the app selector is unknown. Its result is the official text inventory, not Windows' structured `{ apps }` result.

Most methods accept `app` as an app name, full app path or unambiguous bundle identifier. Choose the intended app using the user's goal and the inventory; preserve that selector rather than silently rewriting it. `select_text` accepts an app name or bundle identifier.

Before interacting with an app in each assistant turn, call `get_app_state({ app })`. It starts an app-use session if needed and observes the app's key window. Confirm that the returned scene is the intended document or dialog, not just that the app name matches.

Example direct call:

```text
computer_use_get_app_state({ app: "TextEdit" })
```

The structured result is `{ app, text, screenshot }`. `text` contains the accessibility tree or a diff; `screenshot` is an image block or null. Direct results already include available images. In optional codemode composition, use `text(state.text)` and `image(state.screenshot)` when the screenshot is non-null.

## Keep observations current

Later state requests can return tree diffs. Interpret a diff against the last full tree for that app. If the baseline is missing or uncertain, request a full tree rather than guessing:

```text
computer_use_get_app_state({ app: "TextEdit", disableDiff: true })
```

Element identifiers are strings, for example `element_index: "7"`; copy them from the current tree. Use screenshot pixel coordinates for coordinate actions. After navigation, scrolling, dialogs or a session restart, inspect again before reusing an identifier or coordinate.

These are app-oriented tools: use `app`, not a Windows `window` object. Windows' `get_window_state`, `activate_window`, `screenshotId` and scroll deltas are not interchangeable with this interface.

## Choose one action

All actions below take `app`. Ground the target in current app state, make one state-dependent action, then request `get_app_state` again before deciding what follows.

| Method | Use |
| --- | --- |
| `click` | A string `element_index`, or `x`, `y` in the current screenshot's pixel coordinates. |
| `perform_secondary_action` | A string `element_index` and an `action` exposed by the element. |
| `set_value` | A string `element_index` and `value` for a settable element. |
| `select_text` | A string `element_index` and exact `text` from the tree, including Markdown formatting. |
| `scroll` | A string `element_index`, `direction` (`up`, `down`, `left`, `right`), and optional fractional `pages`. |
| `drag` | `from_x`, `from_y`, `to_x`, `to_y` grounded in the current screenshot. |
| `press_key` | A `key` in xdotool syntax, such as `Return`, `super+c` or `Up`. |
| `type_text` | Literal `text` at the confirmed input focus. |

For repeated text, disambiguate `select_text` with adjacent `prefix` or `suffix` from the tree. Its `selection` is `text` by default, or `cursor_before` / `cursor_after` to place the cursor. Verify the selection or caret before editing.

## Focus and recovery

- Before typing or editing shortcuts, inspect the intended editable region and focus. If a click is needed to focus it, refresh state after that click before entering text.
- A sheet, dialog or different key window changes the scene even within one app. Observe again and choose the appropriate visible control; refresh with `disableDiff: true` if the tree history is unclear.
- If an element is missing or a session was recreated, reacquire app state and select a current identifier. App-session retention does not make identifiers permanent.
- If an action fails with an unknown outcome, inspect before retrying: a transport failure does not establish that the action was undone.
- Follow the shared stopping rules for user cancellation, denied requests and unavailable components. macOS permissions and official approval remain authoritative.
