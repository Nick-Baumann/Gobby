import AppKit
import SwiftUI

@MainActor
final class MenuContextCardInjector: NSObject, NSMenuDelegate {
    static let shared = MenuContextCardInjector()

    private let tag = 9_415_227
    private let cardWidth: CGFloat = 320
    private weak var originalDelegate: NSMenuDelegate?

    func install(into statusItem: NSStatusItem) {
        // SwiftUI owns the menu, but we can inject a custom NSMenuItem.view right before display.
        guard let menu = statusItem.menu else { return }
        // Preserve SwiftUI's internal NSMenuDelegate, otherwise it may stop populating menu items.
        if menu.delegate !== self {
            self.originalDelegate = menu.delegate
            menu.delegate = self
        }
    }

    func menuWillOpen(_ menu: NSMenu) {
        self.originalDelegate?.menuWillOpen?(menu)

        // Remove any previous injected card items.
        for item in menu.items where item.tag == self.tag {
            menu.removeItem(item)
        }

        guard let insertIndex = self.findInsertIndex(in: menu) else { return }

        let cardView = ContextMenuCardView(width: self.cardWidth)
        let hosting = NSHostingView(rootView: cardView)
        let size = hosting.fittingSize
        hosting.frame = NSRect(origin: .zero, size: NSSize(width: self.cardWidth, height: size.height))

        let item = NSMenuItem()
        item.tag = self.tag
        item.view = hosting
        item.isEnabled = false

        menu.insertItem(item, at: insertIndex)
    }

    func menuDidClose(_ menu: NSMenu) {
        self.originalDelegate?.menuDidClose?(menu)
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        self.originalDelegate?.menuNeedsUpdate?(menu)
    }

    func confinementRect(for menu: NSMenu, on screen: NSScreen?) -> NSRect {
        if let rect = self.originalDelegate?.confinementRect?(for: menu, on: screen) {
            return rect
        }
        return NSRect.zero
    }

    private func findInsertIndex(in menu: NSMenu) -> Int? {
        // Prefer inserting before the "Send Heartbeats" toggle item.
        if let idx = menu.items.firstIndex(where: { $0.title == "Send Heartbeats" }) {
            return idx
        }
        // Fallback: insert after the first two rows (active toggle + status).
        if menu.items.count >= 2 { return 2 }
        return menu.items.count
    }
}
