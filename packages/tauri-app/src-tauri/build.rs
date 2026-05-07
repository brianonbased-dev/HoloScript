fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let icon_path = std::path::PathBuf::from(&manifest_dir).join("icons").join("icon.ico");
    let attrs = tauri_build::Attributes::new()
        .windows_attributes(
            tauri_build::WindowsAttributes::new()
                .window_icon_path(icon_path)
        );
    if let Err(e) = tauri_build::try_build(attrs) {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}