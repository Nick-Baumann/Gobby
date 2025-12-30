import Observation
import OSLog

@MainActor
@Observable
final class TalkModeController {
    static let shared = TalkModeController()

    private let logger = Logger(subsystem: "com.steipete.clawdis", category: "talk.controller")

    func setEnabled(_ enabled: Bool) async {
        self.logger.info("talk enabled=\(enabled)")
        if enabled {
            TalkOverlayController.shared.present()
        } else {
            TalkOverlayController.shared.dismiss()
        }
        await TalkModeRuntime.shared.setEnabled(enabled)
    }

    func updatePhase(_ phase: TalkModePhase) {
        TalkOverlayController.shared.updatePhase(phase)
        Task { await GatewayConnection.shared.talkMode(enabled: AppStateStore.shared.talkEnabled, phase: phase.rawValue) }
    }

    func updateLevel(_ level: Double) {
        TalkOverlayController.shared.updateLevel(level)
    }

    func stopSpeaking(reason: TalkStopReason = .userTap) {
        Task { await TalkModeRuntime.shared.stopSpeaking(reason: reason) }
    }

    func exitTalkMode() {
        Task { await AppStateStore.shared.setTalkEnabled(false) }
    }
}

enum TalkStopReason {
    case userTap
    case speech
    case manual
}
