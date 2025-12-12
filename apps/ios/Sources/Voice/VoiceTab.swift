import SwiftUI

struct VoiceTab: View {
    @EnvironmentObject private var appModel: NodeAppModel
    @EnvironmentObject private var voiceWake: VoiceWakeManager
    @AppStorage("voiceWake.enabled") private var voiceWakeEnabled: Bool = false

    var body: some View {
        NavigationStack {
            List {
                Section("Status") {
                    LabeledContent("Voice Wake", value: self.voiceWakeEnabled ? "Enabled" : "Disabled")
                    LabeledContent("Listener", value: self.voiceWake.isListening ? "Listening" : "Idle")
                    Text(self.voiceWake.statusText)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Notes") {
                    Text("Say “clawdis …” to trigger.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Voice")
            .onChange(of: self.voiceWakeEnabled) { _, newValue in
                self.appModel.setVoiceWakeEnabled(newValue)
            }
        }
    }
}
