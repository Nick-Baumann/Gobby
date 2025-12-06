import Foundation
import JavaScriptCore

enum ModelCatalogLoader {
    static let defaultPath: String = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Projects/pi-mono/packages/ai/src/models.generated.ts").path

    static func load(from path: String) async throws -> [ModelChoice] {
        let expanded = (path as NSString).expandingTildeInPath
        let source = try String(contentsOfFile: expanded, encoding: .utf8)
        let sanitized = self.sanitize(source: source)

        let ctx = JSContext()
        ctx?.exceptionHandler = { _, exception in
            if let exception { print("JS exception: \(exception)") }
        }
        ctx?.evaluateScript(sanitized)
        guard let rawModels = ctx?.objectForKeyedSubscript("MODELS")?.toDictionary() as? [String: Any] else {
            throw NSError(
                domain: "ModelCatalogLoader",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to parse models.generated.ts"])
        }

        var choices: [ModelChoice] = []
        for (provider, value) in rawModels {
            guard let models = value as? [String: Any] else { continue }
            for (id, payload) in models {
                guard let dict = payload as? [String: Any] else { continue }
                let name = dict["name"] as? String ?? id
                let ctxWindow = dict["contextWindow"] as? Int
                choices.append(ModelChoice(id: id, name: name, provider: provider, contextWindow: ctxWindow))
            }
        }

        return choices.sorted { lhs, rhs in
            if lhs.provider == rhs.provider {
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            return lhs.provider.localizedCaseInsensitiveCompare(rhs.provider) == .orderedAscending
        }
    }

    private static func sanitize(source: String) -> String {
        guard let exportRange = source.range(of: "export const MODELS"),
              let firstBrace = source[exportRange.upperBound...].firstIndex(of: "{"),
              let lastBrace = source.lastIndex(of: "}")
        else {
            return "var MODELS = {}"
        }
        var body = String(source[firstBrace...lastBrace])
        body = body.replacingOccurrences(
            of: #"(?m)\bsatisfies\s+[^,}\n]+"#,
            with: "",
            options: .regularExpression)
        body = body.replacingOccurrences(
            of: #"(?m)\bas\s+[^;,\n]+"#,
            with: "",
            options: .regularExpression)
        return "var MODELS = \(body);"
    }
}
