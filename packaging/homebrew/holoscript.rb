# HoloScript Homebrew Formula
# Submit to homebrew/homebrew-core: https://github.com/Homebrew/homebrew-core

class Holoscript < Formula
  desc "Open source VR scene description language and compiler"
  homepage "https://holoscript.net"
  url "https://github.com/brianonbased-dev/HoloScript/archive/refs/tags/v3.0.0.tar.gz"
  sha256 "TODO_CALCULATE_SHA256"
  license "MIT"
  head "https://github.com/brianonbased-dev/HoloScript.git", branch: "main"

  # Dependencies
  depends_on "rust" => :build
  depends_on "node" => :build
  depends_on "pnpm" => :build

  # Platform-specific binaries (P.007.01 - Homebrew universal binary pattern)
  if Hardware::CPU.arm?
    url "https://github.com/brianonbased-dev/HoloScript/releases/download/v3.0.0/holoscript-darwin-arm64.tar.gz"
    sha256 "TODO_ARM64_SHA256"
  elsif Hardware::CPU.intel?
    url "https://github.com/brianonbased-dev/HoloScript/releases/download/v3.0.0/holoscript-darwin-x64.tar.gz"
    sha256 "TODO_X64_SHA256"
  end

  def install
    # Build Rust components
    system "cargo", "build", "--release", "--workspace"

    # Install CLI binary
    bin.install "target/release/holoscript"

    # Build npm packages (if building from source)
    if build.head?
      system "pnpm", "install", "--frozen-lockfile"
      system "pnpm", "build"
    end

    # Install LSP server
    libexec.install "packages/lsp/dist"
    (bin/"holoscript-lsp").write_env_script libexec/"dist/server.js", NODE_PATH: libexec/"node_modules"

    # Install shell completions
    generate_completions_from_executable(bin/"holoscript", "completions")
  end

  test do
    # Test CLI
    system bin/"holoscript", "--version"

    # Test LSP server
    system bin/"holoscript-lsp", "--version"

    # Test compilation
    (testpath/"test.hs").write <<~EOS
      object "TestCube" @grabbable {
        geometry: "cube"
        position: [0, 1, -2]
        material: "glass"
      }
    EOS

    system bin/"holoscript", "compile", "test.hs"
  end

  service do
    run [opt_bin/"holoscript-lsp", "--stdio"]
    keep_alive false
    log_path var/"log/holoscript-lsp.log"
    error_log_path var/"log/holoscript-lsp.error.log"
  end
end
