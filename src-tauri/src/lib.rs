// ═══════════════════════════════════════════════════════════════════════════
// T-minus — the floating engine
//
// The window is frameless, transparent, always-on-top and hidden from the
// taskbar. The frontend grows and shrinks it as the brief panel opens, so the
// window is never larger than the thing it's drawing.
//
// Ghost mode makes the widget click-through: the OS routes mouse input to
// whatever is underneath. Because a click-through window can't receive the
// click that would turn it off again, the toggle lives on a global shortcut.
// ═══════════════════════════════════════════════════════════════════════════

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const WIDTH: f64 = 452.0;

static GHOST: AtomicBool = AtomicBool::new(false);

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Resize the widget to match its rendered content height.
#[tauri::command]
fn resize_height(window: WebviewWindow, h: f64) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(WIDTH, h.clamp(80.0, 900.0)))
        .map_err(|e| e.to_string())
}

/// Hide to the tray. The countdown keeps running; only the window goes away.
#[tauri::command]
fn hide_widget(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn is_ghost() -> bool {
    GHOST.load(Ordering::Relaxed)
}

/// Click-through on or off.
fn set_ghost(app: &AppHandle, on: bool) {
    if let Some(w) = main_window(app) {
        let _ = w.set_ignore_cursor_events(on);
        GHOST.store(on, Ordering::Relaxed);
        let _ = w.emit_to("main", "ghost", on);
    }
}

fn toggle_visible(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        match w.is_visible() {
            Ok(true) => {
                let _ = w.hide();
            }
            _ => {
                let _ = w.show();
                let _ = w.set_always_on_top(true);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Ctrl+Alt+T  toggles visibility
    // Ctrl+Alt+G  toggles click-through
    let sc_show = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT);
    let sc_ghost = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyG);

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &sc_show {
                        toggle_visible(app);
                    } else if shortcut == &sc_ghost {
                        let now = GHOST.load(Ordering::Relaxed);
                        set_ghost(app, !now);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            resize_height,
            hide_widget,
            is_ghost
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // Register the shortcuts now that the plugin is up.
            let shortcuts_ok = {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                handle.global_shortcut().register(sc_show).is_ok()
                    && handle.global_shortcut().register(sc_ghost).is_ok()
            };

            // Windows: keep it above normal windows without stealing focus.
            if let Some(w) = main_window(&handle) {
                let _ = w.set_always_on_top(true);
                let _ = w.set_skip_taskbar(true);
            }

            // ── tray ────────────────────────────────────────────────────────
            let show = MenuItem::with_id(app, "show", "Show / hide", true, Some("Ctrl+Alt+T"))?;
            let ghost = MenuItem::with_id(app, "ghost", "Click-through", true, Some("Ctrl+Alt+G"))?;
            let boot = MenuItem::with_id(app, "boot", "Start with Windows", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &ghost, &boot, &quit])?;

            let tip: &str = if shortcuts_ok { "T-minus" } else { "T-minus (shortcut failed)" };

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(tip)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_visible(app),
                    "ghost" => {
                        let now = GHOST.load(Ordering::Relaxed);
                        set_ghost(app, !now);
                    }
                    "boot" => {
                        use tauri_plugin_autostart::ManagerExt;
                        let m = app.autolaunch();
                        match m.is_enabled() {
                            Ok(true) => {
                                let _ = m.disable();
                            }
                            _ => {
                                let _ = m.enable();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to launch T-minus");
}
