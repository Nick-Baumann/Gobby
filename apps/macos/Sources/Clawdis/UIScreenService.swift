import AppKit
import ClawdisIPC
import CoreGraphics

enum UIScreenService {
    static func listScreens() -> [UIScreenInfo] {
        let screens = NSScreen.screens
        let mainScreen = NSScreen.main

        return screens.enumerated().map { index, screen in
            UIScreenInfo(
                index: index,
                name: screen.peekabooName,
                frame: screen.frame,
                visibleFrame: screen.visibleFrame,
                isPrimary: screen == mainScreen,
                scaleFactor: screen.backingScaleFactor,
                displayID: screen.displayID)
        }
    }
}

private extension NSScreen {
    var displayID: UInt32 {
        if let num = self.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
            return num.uint32Value
        }
        return 0
    }

    /// Match Peekaboo's `ScreenService` naming (built-in vs. resolution fallback).
    var peekabooName: String {
        let id = self.displayID
        guard id != 0 else { return "Display" }
        if CGDisplayIsBuiltin(id) != 0 { return "Built-in Display" }

        if let mode = CGDisplayCopyDisplayMode(id) {
            return "\(mode.pixelWidth)×\(mode.pixelHeight) Display"
        }

        return "External Display"
    }
}

