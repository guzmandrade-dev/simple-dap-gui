cask "simple-dap-gui" do
  version "0.4.2"
  sha256 :no_check

  url "https://github.com/guzmandrade-dev/simple-dap-gui/releases/download/v#{version}/simple-dap-gui-#{version}.dmg"
  name "simple-dap-gui"
  desc "Standalone DAP client GUI for debugging"
  homepage "https://github.com/guzmandrade-dev/simple-dap-gui"

  livecheck do
    url :url
    regex(/^v?(\d+(?:\.\d+)+)$/i)
  end

  app "simple-dap-gui.app"

  zap trash: [
    "~/Library/Application Support/simple-dap-gui",
    "~/Library/Logs/simple-dap-gui",
    "~/Library/Preferences/com.guzmandrade.simple-dap-gui.plist",
    "~/Library/Saved Application State/com.guzmandrade.simple-dap-gui.savedState",
  ]
end
