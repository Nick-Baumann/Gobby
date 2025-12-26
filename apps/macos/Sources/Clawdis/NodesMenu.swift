import AppKit
import SwiftUI

struct NodeMenuEntryFormatter {
    static func isGateway(_ entry: InstanceInfo) -> Bool {
        entry.mode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "gateway"
    }

    static func isLocal(_ entry: InstanceInfo) -> Bool {
        entry.mode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "local"
    }

    static func primaryName(_ entry: InstanceInfo) -> String {
        if self.isGateway(entry) {
            let host = entry.host?.nonEmpty
            if let host, host.lowercased() != "gateway" { return host }
            return "Gateway"
        }
        return entry.host?.nonEmpty ?? entry.id
    }

    static func summaryText(_ entry: InstanceInfo) -> String {
        entry.text.nonEmpty ?? self.primaryName(entry)
    }

    static func detailLeft(_ entry: InstanceInfo) -> String {
        var modeLabel: String?
        if self.isGateway(entry) {
            modeLabel = "gateway"
        } else if let mode = entry.mode?.nonEmpty {
            modeLabel = mode
        }
        if let version = entry.version?.nonEmpty {
            let base = modeLabel ?? "node"
            modeLabel = "\(base) v\(version)"
        }

        if let modeLabel { return modeLabel }

        if let text = entry.text.nonEmpty {
            let trimmed = text
                .replacingOccurrences(of: "Node: ", with: "")
                .replacingOccurrences(of: "Gateway: ", with: "")
            let candidates = trimmed
                .components(separatedBy: " · ")
                .filter { !$0.hasPrefix("mode ") && !$0.hasPrefix("reason ") }
            if let first = candidates.first, !first.isEmpty { return first }
        }

        return entry.ageDescription
    }

    static func detailRight(_ entry: InstanceInfo) -> String? {
        if let ip = entry.ip?.nonEmpty { return ip }
        if let platform = entry.platform?.nonEmpty { return platform }
        return nil
    }

    static func leadingSymbol(_ entry: InstanceInfo) -> String {
        if self.isGateway(entry) { return self.safeSystemSymbol("dot.radiowaves.left.and.right", fallback: "network") }
        if let family = entry.deviceFamily?.lowercased() {
            if family.contains("mac") {
                return self.safeSystemSymbol("laptopcomputer", fallback: "laptopcomputer")
            }
            if family.contains("iphone") { return self.safeSystemSymbol("iphone", fallback: "iphone") }
            if family.contains("ipad") { return self.safeSystemSymbol("ipad", fallback: "ipad") }
        }
        if let platform = entry.platform?.lowercased() {
            if platform.contains("mac") { return self.safeSystemSymbol("laptopcomputer", fallback: "laptopcomputer") }
            if platform.contains("ios") { return self.safeSystemSymbol("iphone", fallback: "iphone") }
            if platform.contains("android") { return self.safeSystemSymbol("cpu", fallback: "cpu") }
        }
        return "cpu"
    }

    static func isAndroid(_ entry: InstanceInfo) -> Bool {
        let family = entry.deviceFamily?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return family == "android"
    }

    private static func safeSystemSymbol(_ preferred: String, fallback: String) -> String {
        if NSImage(systemSymbolName: preferred, accessibilityDescription: nil) != nil { return preferred }
        return fallback
    }
}

struct NodeMenuRowView: View {
    let entry: InstanceInfo
    let width: CGFloat
    @Environment(\.menuItemHighlighted) private var isHighlighted

    private var primaryColor: Color {
        self.isHighlighted ? Color(nsColor: .selectedMenuItemTextColor) : .primary
    }

    private var secondaryColor: Color {
        self.isHighlighted ? Color(nsColor: .selectedMenuItemTextColor).opacity(0.85) : .secondary
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            self.leadingIcon
                .frame(width: 22, height: 22, alignment: .center)

            VStack(alignment: .leading, spacing: 2) {
                Text(NodeMenuEntryFormatter.primaryName(self.entry))
                    .font(.callout.weight(NodeMenuEntryFormatter.isGateway(self.entry) ? .semibold : .regular))
                    .foregroundStyle(self.primaryColor)
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: 8) {
                    Text(NodeMenuEntryFormatter.detailLeft(self.entry))
                        .font(.caption)
                        .foregroundStyle(self.secondaryColor)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    Spacer(minLength: 0)

                    if let right = NodeMenuEntryFormatter.detailRight(self.entry) {
                        Text(right)
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(self.secondaryColor)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        }
        .padding(.vertical, 8)
        .padding(.leading, 18)
        .padding(.trailing, 12)
        .frame(width: max(1, self.width), alignment: .leading)
    }

    @ViewBuilder
    private var leadingIcon: some View {
        if NodeMenuEntryFormatter.isAndroid(self.entry) {
            AndroidMark()
                .foregroundStyle(self.secondaryColor)
        } else {
            Image(systemName: NodeMenuEntryFormatter.leadingSymbol(self.entry))
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(self.secondaryColor)
        }
    }
}

struct AndroidMark: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let headHeight = h * 0.68
            let headWidth = w * 0.92
            let headX = (w - headWidth) * 0.5
            let headY = (h - headHeight) * 0.5
            let corner = min(w, h) * 0.18
            RoundedRectangle(cornerRadius: corner, style: .continuous)
                .frame(width: headWidth, height: headHeight)
                .position(x: headX + headWidth * 0.5, y: headY + headHeight * 0.5)
        }
    }
}
