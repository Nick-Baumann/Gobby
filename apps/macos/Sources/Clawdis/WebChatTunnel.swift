import Foundation
import Network
import OSLog

/// Port forwarding tunnel for remote mode.
///
/// Uses `ssh -N -L` to forward the remote gateway ports to localhost.
final class WebChatTunnel {
    private static let logger = Logger(subsystem: "com.steipete.clawdis", category: "webchat.tunnel")

    let process: Process
    let localPort: UInt16?

    private init(process: Process, localPort: UInt16?) {
        self.process = process
        self.localPort = localPort
    }

    deinit {
        let pid = self.process.processIdentifier
        self.process.terminate()
        Task { await PortGuardian.shared.removeRecord(pid: pid) }
    }

    func terminate() {
        let pid = self.process.processIdentifier
        if self.process.isRunning {
            self.process.terminate()
            self.process.waitUntilExit()
        }
        Task { await PortGuardian.shared.removeRecord(pid: pid) }
    }

    static func create(remotePort: Int, preferredLocalPort: UInt16? = nil) async throws -> WebChatTunnel {
        let settings = CommandResolver.connectionSettings()
        guard settings.mode == .remote, let parsed = CommandResolver.parseSSHTarget(settings.target) else {
            throw NSError(
                domain: "WebChatTunnel",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Remote mode is not configured"])
        }

        let localPort = try await Self.findPort(preferred: preferredLocalPort)
        var args: [String] = [
            "-o", "BatchMode=yes",
            "-o", "IdentitiesOnly=yes",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=15",
            "-o", "ServerAliveCountMax=3",
            "-o", "TCPKeepAlive=yes",
            "-N",
            "-L", "\(localPort):127.0.0.1:\(remotePort)",
        ]
        if parsed.port > 0 { args.append(contentsOf: ["-p", String(parsed.port)]) }
        let identity = settings.identity.trimmingCharacters(in: .whitespacesAndNewlines)
        if !identity.isEmpty { args.append(contentsOf: ["-i", identity]) }
        let userHost = parsed.user.map { "\($0)@\(parsed.host)" } ?? parsed.host
        args.append(userHost)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ssh")
        process.arguments = args

        let pipe = Pipe()
        process.standardError = pipe

        // Consume stderr so ssh cannot block if it logs.
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty,
                  let line = String(data: data, encoding: .utf8)?
                      .trimmingCharacters(in: .whitespacesAndNewlines),
                      !line.isEmpty else { return }
            Self.logger.error("ssh tunnel stderr: \(line, privacy: .public)")
        }

        try process.run()

        // Track tunnel so we can clean up stale listeners on restart.
        Task {
            await PortGuardian.shared.record(
                port: Int(localPort),
                pid: process.processIdentifier,
                command: process.executableURL?.path ?? "ssh",
                mode: CommandResolver.connectionSettings().mode)
        }

        return WebChatTunnel(process: process, localPort: localPort)
    }

    private static func findPort(preferred: UInt16?) async throws -> UInt16 {
        if let preferred, self.portIsFree(preferred) { return preferred }

        return try await withCheckedThrowingContinuation { cont in
            let queue = DispatchQueue(label: "com.steipete.clawdis.webchat.port", qos: .utility)
            do {
                let listener = try NWListener(using: .tcp, on: .any)
                listener.newConnectionHandler = { connection in connection.cancel() }
                listener.stateUpdateHandler = { state in
                    switch state {
                    case .ready:
                        if let port = listener.port?.rawValue {
                            listener.stateUpdateHandler = nil
                            listener.cancel()
                            cont.resume(returning: port)
                        }
                    case let .failed(error):
                        listener.stateUpdateHandler = nil
                        listener.cancel()
                        cont.resume(throwing: error)
                    default:
                        break
                    }
                }
                listener.start(queue: queue)
            } catch {
                cont.resume(throwing: error)
            }
        }
    }

    private static func portIsFree(_ port: UInt16) -> Bool {
        do {
            let listener = try NWListener(using: .tcp, on: NWEndpoint.Port(rawValue: port)!)
            listener.cancel()
            return true
        } catch {
            return false
        }
    }
}
