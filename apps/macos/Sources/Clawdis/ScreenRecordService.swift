import AVFoundation
import Foundation
import OSLog
@preconcurrency import ScreenCaptureKit

@MainActor
final class ScreenRecordService {
    enum ScreenRecordError: LocalizedError {
        case noDisplays
        case invalidScreenIndex(Int)
        case noFramesCaptured
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .noDisplays:
                "No displays available for screen recording"
            case let .invalidScreenIndex(idx):
                "Invalid screen index \(idx)"
            case .noFramesCaptured:
                "No frames captured"
            case let .writeFailed(msg):
                msg
            }
        }
    }

    private let logger = Logger(subsystem: "com.steipete.clawdis", category: "screenRecord")

    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        outPath: String?) async throws -> String
    {
        let durationMs = Self.clampDurationMs(durationMs)
        let fps = Self.clampFps(fps)

        let outURL: URL = {
            if let outPath, !outPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return URL(fileURLWithPath: outPath)
            }
            return FileManager.default.temporaryDirectory
                .appendingPathComponent("clawdis-screen-record-\(UUID().uuidString).mp4")
        }()
        try? FileManager.default.removeItem(at: outURL)

        let content = try await SCShareableContent.current
        let displays = content.displays.sorted { $0.displayID < $1.displayID }
        guard !displays.isEmpty else { throw ScreenRecordError.noDisplays }

        let idx = screenIndex ?? 0
        guard idx >= 0, idx < displays.count else { throw ScreenRecordError.invalidScreenIndex(idx) }
        let display = displays[idx]

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.queueDepth = 8
        config.showsCursor = true
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(max(1, Int32(fps.rounded()))))

        let recorder = try StreamRecorder(
            outputURL: outURL,
            width: display.width,
            height: display.height,
            logger: self.logger)

        let stream = SCStream(filter: filter, configuration: config, delegate: recorder)
        try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: recorder.queue)

        self.logger.info(
            "screen record start idx=\(idx) durationMs=\(durationMs) fps=\(fps) out=\(outURL.path, privacy: .public)")

        var started = false
        do {
            try await stream.startCapture()
            started = true
            try await Task.sleep(nanoseconds: UInt64(durationMs) * 1_000_000)
            try await stream.stopCapture()
        } catch {
            if started { try? await stream.stopCapture() }
            throw error
        }

        try await recorder.finish()
        return outURL.path
    }

    private nonisolated static func clampDurationMs(_ ms: Int?) -> Int {
        let v = ms ?? 10_000
        return min(60_000, max(250, v))
    }

    private nonisolated static func clampFps(_ fps: Double?) -> Double {
        let v = fps ?? 10
        if !v.isFinite { return 10 }
        return min(60, max(1, v))
    }
}

private final class StreamRecorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let queue = DispatchQueue(label: "com.steipete.clawdis.screenRecord.writer")

    private let logger: Logger
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput

    private var started = false
    private var sawFrame = false
    private var didFinish = false
    private var pendingErrorMessage: String?

    init(outputURL: URL, width: Int, height: Int, logger: Logger) throws {
        self.logger = logger
        self.writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)

        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
        ]
        self.input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        self.input.expectsMediaDataInRealTime = true

        guard self.writer.canAdd(self.input) else {
            throw ScreenRecordService.ScreenRecordError.writeFailed("Cannot add video input")
        }
        self.writer.add(self.input)
        super.init()
    }

    func stream(_ stream: SCStream, didStopWithError error: any Error) {
        self.queue.async {
            let msg = String(describing: error)
            self.pendingErrorMessage = msg
            self.logger.error("screen record stream stopped with error: \(msg, privacy: .public)")
            _ = stream
        }
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType)
    {
        guard type == .screen else { return }
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        // Callback runs on `sampleHandlerQueue` (`self.queue`).
        self.handle(sampleBuffer: sampleBuffer)
        _ = stream
    }

    private func handle(sampleBuffer: CMSampleBuffer) {
        if let msg = self.pendingErrorMessage {
            self.logger.error("screen record aborting due to prior error: \(msg, privacy: .public)")
            return
        }
        if self.didFinish { return }

        if !self.started {
            guard self.writer.startWriting() else {
                self.pendingErrorMessage = self.writer.error?.localizedDescription ?? "Failed to start writer"
                return
            }
            let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            self.writer.startSession(atSourceTime: pts)
            self.started = true
        }

        self.sawFrame = true
        if self.input.isReadyForMoreMediaData {
            _ = self.input.append(sampleBuffer)
        }
    }

    func finish() async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            self.queue.async {
                if let msg = self.pendingErrorMessage {
                    cont.resume(throwing: ScreenRecordService.ScreenRecordError.writeFailed(msg))
                    return
                }
                guard self.started, self.sawFrame else {
                    cont.resume(throwing: ScreenRecordService.ScreenRecordError.noFramesCaptured)
                    return
                }
                if self.didFinish {
                    cont.resume()
                    return
                }
                self.didFinish = true

                self.input.markAsFinished()
                self.writer.finishWriting {
                    if let err = self.writer.error {
                        cont.resume(throwing: ScreenRecordService.ScreenRecordError.writeFailed(err.localizedDescription))
                    } else if self.writer.status != .completed {
                        cont.resume(throwing: ScreenRecordService.ScreenRecordError.writeFailed("Failed to finalize video"))
                    } else {
                        cont.resume()
                    }
                }
            }
        }
    }
}

