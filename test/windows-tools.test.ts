import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { MAC_PLATFORM, WINDOWS_PLATFORM, hostPlatform } from "../src/platform.ts";
import { COMPUTER_USE_METHODS, type DirectToolArguments } from "../src/tools.ts";
import {
	WINDOWS_COMPUTER_USE_METHODS,
	WINDOWS_TOOL_INPUT_SCHEMAS,
	WINDOWS_TOOL_METADATA,
	validateWindowsArguments,
	type WindowsDirectMethod,
} from "../src/windows-tools.ts";

const window = { app: "Chrome", id: 7, title: "Tab" };

test("Windows schemas accept official window objects, numeric-string indexes and compatible extra arguments", () => {
	assert.deepEqual(
		validateWindowsArguments("click", { window, element_index: "7", futureOption: true }),
		{ window, element_index: "7", futureOption: true },
	);
	assert.deepEqual(validateWindowsArguments("list_apps", { futureOption: true }), { futureOption: true });
	assert.deepEqual(validateWindowsArguments("get_window", { id: 7 }), { id: 7 });
	assert.deepEqual(
		validateWindowsArguments("scroll", { window, x: 10, y: 20, scrollX: 0, scrollY: -3 }),
		{ window, x: 10, y: 20, scrollX: 0, scrollY: -3 },
	);
	assert.throws(() => validateWindowsArguments("scroll", { window, x: 10, y: 20 }));
	assert.throws(() => validateWindowsArguments("get_window_state", { app: "Chrome" }));
	assert.throws(() => validateWindowsArguments("click", { window: { app: "Chrome" } }));
});

test("Windows accepts every documented mouse button spelling without rewriting it", () => {
	const buttons = ["left", "right", "middle", "l", "r", "m"];
	for (const mouse_button of buttons) {
		const args = { window, mouse_button, screenshotId: "shot-0", x: 12, y: 34 };
		assert.deepEqual(validateWindowsArguments("click", args), args);
	}
	const schema = z.object({ properties: z.object({ mouse_button: z.object({ enum: z.array(z.string()) }) }) })
		.parse(WINDOWS_TOOL_INPUT_SCHEMAS.click);
	assert.deepEqual(schema.properties.mouse_button.enum, buttons);
});

test("the thirteen documented Windows calls preserve selectors, screenshot ids and compatible additions", () => {
	const target = { app: "process:C:\\Apps\\Example.exe", id: 42, title: "Document", extraWindowField: "preserve" };
	const fixtures = {
		list_apps: {},
		list_windows: {},
		get_window: { id: target.id, app: target.app },
		launch_app: { app: "C:\\Apps\\Example.exe" },
		get_window_state: { window: target, include_screenshot: false, include_text: true },
		click: { window: target, click_count: 2, mouse_button: "r", screenshotId: "shot-1", x: 10, y: 20 },
		press_key: { window: target, key: "Control_L+Shift_L+period" },
		type_text: { window: target, text: "hello" },
		scroll: { window: target, x: 10, y: 20, scrollX: -12, scrollY: 34, screenshotId: "shot-2" },
		set_value: { window: target, element_index: 3, value: "replacement" },
		drag: { window: target, from_x: 1, from_y: 2, to_x: 30, to_y: 40, screenshotId: "shot-3" },
		perform_secondary_action: { window: target, element_index: 4, action: "Scroll Down" },
		activate_window: { window: target },
	} satisfies Record<WindowsDirectMethod, DirectToolArguments>;
	assert.deepEqual([...WINDOWS_COMPUTER_USE_METHODS].sort(), Object.keys(fixtures).sort());
	assert.deepEqual(Object.keys(WINDOWS_TOOL_INPUT_SCHEMAS).sort(), Object.keys(fixtures).sort());
	for (const method of WINDOWS_COMPUTER_USE_METHODS) {
		const args = { ...fixtures[method], extraArgument: { preserved: true } };
		assert.deepEqual(validateWindowsArguments(method, args), args, method);
	}
});

test("Windows tool tables cover every official method", () => {
	for (const method of WINDOWS_COMPUTER_USE_METHODS) {
		assert.equal(WINDOWS_TOOL_INPUT_SCHEMAS[method].type, "object", method);
		assert.ok(WINDOWS_TOOL_METADATA[method].description.length > 0, method);
	}
	const readOnly = WINDOWS_COMPUTER_USE_METHODS.filter((method) => WINDOWS_TOOL_METADATA[method].annotations.readOnlyHint);
	assert.deepEqual(readOnly, ["list_apps", "list_windows", "get_window", "get_window_state"]);
});

test("platform profiles select the host transport and its method set", () => {
	assert.deepEqual(MAC_PLATFORM.methods, COMPUTER_USE_METHODS);
	assert.deepEqual(WINDOWS_PLATFORM.methods, WINDOWS_COMPUTER_USE_METHODS);
	assert.equal(MAC_PLATFORM.opensSession("get_app_state"), true);
	assert.equal(MAC_PLATFORM.opensSession("click"), false);
	assert.equal(WINDOWS_PLATFORM.opensSession("list_apps"), true);
	assert.equal(WINDOWS_PLATFORM.isMethod("get_app_state"), false);
	assert.equal(MAC_PLATFORM.isMethod("get_window_state"), false);
	assert.equal(hostPlatform().name, process.platform === "win32" ? "windows" : "mac");
});
