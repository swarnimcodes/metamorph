#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_google_auth::init());
    // Android: the browser sign-in comes back to the app through a deep link (see src/lib/google.ts).
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_deep_link::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
