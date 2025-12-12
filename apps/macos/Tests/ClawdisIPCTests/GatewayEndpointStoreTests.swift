import Foundation
import Testing
@testable import Clawdis

@Suite struct GatewayEndpointStoreTests {
    private final class ModeBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: AppState.ConnectionMode

        init(_ initial: AppState.ConnectionMode) {
            self.value = initial
        }

        func get() -> AppState.ConnectionMode {
            self.lock.lock()
            defer { self.lock.unlock() }
            return self.value
        }

        func set(_ next: AppState.ConnectionMode) {
            self.lock.lock()
            defer { self.lock.unlock() }
            self.value = next
        }
    }

    @Test func localRefreshResolvesToLocalhostPort() async throws {
        let mode = ModeBox(.local)
        let store = GatewayEndpointStore(deps: .init(
            mode: { mode.get() },
            token: { "t" },
            localPort: { 1234 },
            remotePortIfRunning: { nil },
            ensureRemoteTunnel: { 18789 }))

        await store.refresh()
        let cfg = try await store.requireConfig()
        #expect(cfg.url.absoluteString == "ws://127.0.0.1:1234")
        #expect(cfg.token == "t")
    }

    @Test func remoteWithoutTunnelIsUnavailable() async throws {
        let mode = ModeBox(.remote)
        let store = GatewayEndpointStore(deps: .init(
            mode: { mode.get() },
            token: { nil },
            localPort: { 18789 },
            remotePortIfRunning: { nil },
            ensureRemoteTunnel: { 18789 }))

        do {
            _ = try await store.requireConfig()
            Issue.record("expected requireConfig to throw")
        } catch {
            #expect(error.localizedDescription.contains("no active control tunnel"))
        }
    }

    @Test func ensureRemoteTunnelPublishesReadyState() async throws {
        let mode = ModeBox(.remote)
        let store = GatewayEndpointStore(deps: .init(
            mode: { mode.get() },
            token: { "tok" },
            localPort: { 1 },
            remotePortIfRunning: { 5555 },
            ensureRemoteTunnel: { 5555 }))

        let stream = await store.subscribe(bufferingNewest: 10)
        var iterator = stream.makeAsyncIterator()

        _ = await iterator.next() // initial
        _ = try await store.ensureRemoteControlTunnel()

        let next = await iterator.next()
        guard case let .ready(mode, url, token) = next else {
            Issue.record("expected .ready after ensure, got \(String(describing: next))")
            return
        }
        #expect(mode == .remote)
        #expect(url.absoluteString == "ws://127.0.0.1:5555")
        #expect(token == "tok")
    }
}
