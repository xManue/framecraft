fn main() {
    let output =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("opcua-sdk.pack");
    println!("cargo:rerun-if-changed=../scripts/package-opcua-sdk.mjs");
    println!("cargo:rerun-if-changed=../package-lock.json");
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let root = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap())
            .parent()
            .unwrap()
            .to_path_buf();
        let result = std::process::Command::new("node")
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .arg(root.join("scripts/package-opcua-sdk.mjs"))
            .arg(&root)
            .arg(&output)
            .status()
            .expect("Node.js is required to package the app OPC UA SDK");
        assert!(
            result.success(),
            "OPC UA SDK packaging failed; check the locked app dependencies"
        );
    } else {
        // No SDK traversal/copy during npm run dev or ordinary targeted Rust tests.
        std::fs::write(output, []).expect("Cannot prepare the OPC UA development marker");
    }
    tauri_build::build()
}
