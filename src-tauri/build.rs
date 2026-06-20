fn main() {
    // The `eventkit` crate links a Swift bridge that references the Swift
    // runtime (e.g. `@rpath/libswift_Concurrency.dylib`). A dependency's
    // `cargo:rustc-link-arg` does not propagate to the final binary, so we add
    // the rpath to the Swift runtime here, on the binary that actually links it.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");

        // Fall back to the active Xcode/CLT toolchain's Swift libraries when the
        // OS runtime isn't sufficient (older macOS / Swift-only symbols).
        if let Ok(output) = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
        {
            if output.status.success() {
                let dev = String::from_utf8_lossy(&output.stdout);
                let dev = dev.trim();
                let swift_macos = format!(
                    "{dev}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx"
                );
                println!("cargo:rustc-link-arg=-Wl,-rpath,{swift_macos}");
            }
        }
    }

    tauri_build::build()
}
