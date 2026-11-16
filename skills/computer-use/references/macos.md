# macOS Computer Use

## Identify and observe the app

- Use `computer_use_list_apps` to find the app when its selector is unknown. Most tools accept an app name, full app path or unambiguous bundle identifier as `app`. Preserve the selected value. For `computer_use_select_text`, use an app name or bundle identifier.
- Call `computer_use_get_app_state({ app })` before interacting with an app in each assistant turn. Confirm that the key window contains the intended document or dialog.
- Interpret tree diffs against the previous observations for that app. If the baseline is missing or uncertain, request a full tree with `computer_use_get_app_state({ app, disableDiff: true })`.

## Target an action

- Copy `element_index` as a string from the current tree, for example `"7"`. Use screenshot pixel coordinates for coordinate actions.
- Use xdotool syntax for key chords, for example `super+c`.
- For `computer_use_select_text`, copy the exact text from the tree, including Markdown formatting. Disambiguate repeated text with the adjacent `prefix` or `suffix`. Use `cursor_before` or `cursor_after` to place the caret, then verify the selection or caret before editing.
