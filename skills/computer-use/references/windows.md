# Windows Computer Use

## Locate the intended window

- Call `computer_use_list_windows` for open windows or `computer_use_list_apps` to find an app and its reported windows. If the app has no window, pass its listed app ID to `computer_use_launch_app`, then list windows again.
- Pass the complete returned window object unchanged as `window`, including its `app` selector and any additional fields. If a dialog opens in a separate window, list windows and select the dialog's returned object.
- Use `computer_use_get_window` with the previous ID and optional app selector to recover a reference to a still-open window. If the window was closed or replaced, list windows again.

## Read state and target an action

- Call `computer_use_get_window_state({ window, include_text: true })` for a screenshot and the indexed accessibility tree. Check `accessibility.focused_element` when available, including after explicit window activation.
- Use `element_index` from the latest tree. For coordinate actions, use window-relative coordinates from the latest screenshot and pass its ID as `screenshotId` when the tool supports it.
- For key chords, use keysyms such as `Control_L+a`. When the user presses Esc to cancel the helper, follow the skill's cancellation guidance.
